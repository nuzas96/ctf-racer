import fs from "node:fs";
import path from "node:path";
import { appendRunLog, writeState } from "./workspace.js";
import { extractFlag } from "./flag.js";
import { continuationPrompt, initialPrompt } from "./prompt.js";

function finishState(state, runRoot, startedMs) {
  const finishedMs = Date.now();
  state.finished_at = new Date(finishedMs).toISOString();
  state.elapsed_ms = finishedMs - startedMs;
  writeState(runRoot, state);
}

export async function solveChallenge({ challenge, policy, state, runRoot, session }) {
  const responses = [];
  const startedMs = Date.now();

  state.status = "running";
  state.started_at = new Date(startedMs).toISOString();
  writeState(runRoot, state);
  appendRunLog(runRoot, "agent started");

  try {
    for (let round = 1; round <= policy.max_continuation_rounds; round++) {
      state.rounds = round;
      writeState(runRoot, state);
      appendRunLog(runRoot, `round ${round} started`);

      const prompt = round === 1 ? initialPrompt(challenge, policy) : continuationPrompt(round);
      const turn = await session.run(prompt);
      responses.push(turn.finalResponse);

      const responseFile = path.join(runRoot, `response-${round}.md`);
      fs.writeFileSync(responseFile, turn.finalResponse + "\n");
      state.last_response_file = responseFile;

      const flag = extractFlag(turn.finalResponse, challenge.flag_regex);
      if (flag) {
        state.status = "solved";
        state.flag = flag;
        finishState(state, runRoot, startedMs);
        appendRunLog(runRoot, `flag detected: ${flag}`);
        return { state, responses };
      }

      appendRunLog(runRoot, `round ${round} completed without verified flag`);
    }

    state.status = "unsolved";
    finishState(state, runRoot, startedMs);
    appendRunLog(runRoot, "run ended without verified flag");
    return { state, responses };
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.message : String(error);
    finishState(state, runRoot, startedMs);
    appendRunLog(runRoot, `error: ${state.error}`);
    throw error;
  }
}
