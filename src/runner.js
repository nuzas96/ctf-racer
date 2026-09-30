import fs from "node:fs";
import path from "node:path";
import { appendRunLog, writeState } from "./workspace.js";
import { extractFlag, verifyFlagCandidate } from "./flag.js";
import { continuationPrompt, initialPrompt } from "./prompt.js";
import { evaluateRound, snapshotProgress } from "./stall.js";

function finishState(state, runRoot, startedMs) {
  const finishedMs = Date.now();
  state.finished_at = new Date(finishedMs).toISOString();
  state.elapsed_ms = finishedMs - startedMs;
  writeState(runRoot, state);
}

export async function solveChallenge({ challenge, policy, state, runRoot, session, skillNames }) {
  const responses = [];
  const startedMs = Date.now();
  let consecutiveStalls = 0;
  let previousAssessment = null;

  state.status = "running";
  state.started_at = new Date(startedMs).toISOString();
  state.stall_count = 0;
  state.consecutive_stalls = 0;
  state.round_diagnostics = [];
  writeState(runRoot, state);
  appendRunLog(runRoot, "agent started");

  try {
    for (let round = 1; round <= policy.max_continuation_rounds; round++) {
      state.rounds = round;
      writeState(runRoot, state);
      appendRunLog(runRoot, `round ${round} started`);

      const before = snapshotProgress(state.workspace);
      const prompt = round === 1
        ? initialPrompt(challenge, policy, skillNames)
        : continuationPrompt(round, skillNames, previousAssessment);

      const turn = await session.run(prompt);
      const after = snapshotProgress(state.workspace);

      const assessment = evaluateRound({
        before,
        after,
        response: turn.finalResponse,
        previousResponses: responses,
        similarityThreshold: policy.stall_similarity_threshold,
      });

      responses.push(turn.finalResponse);

      const responseFile = path.join(runRoot, `response-${round}.md`);
      fs.writeFileSync(responseFile, turn.finalResponse + "\n");
      state.last_response_file = responseFile;

      state.round_diagnostics.push({
        round,
        stalled: assessment.stalled,
        reasons: assessment.reasons,
        workspace_changed: assessment.workspaceChanged,
        progress_marker: assessment.progressMarker,
        stalled_marker: assessment.stalledMarker,
        max_response_similarity: Number(assessment.maxSimilarity.toFixed(4)),
      });

      const flag = extractFlag(turn.finalResponse, challenge.flag_regex, challenge.flag_format);
      if (flag) {
        state.flag = flag;
        state.consecutive_stalls = 0;

        if (challenge.flag_sha256) {
          state.flag_verified = verifyFlagCandidate(flag, challenge.flag_sha256);
          state.status = state.flag_verified ? "solved" : "candidate";
          finishState(state, runRoot, startedMs);
          appendRunLog(
            runRoot,
            state.flag_verified
              ? `verified flag: ${flag}`
              : `unverified flag candidate rejected by benchmark hash: ${flag}`
          );
          return { state, responses };
        }

        state.flag_verified = false;
        state.status = "candidate";
        finishState(state, runRoot, startedMs);
        appendRunLog(runRoot, `unverified flag candidate: ${flag}`);
        return { state, responses };
      }

      if (assessment.stalled) {
        consecutiveStalls += 1;
        state.stall_count += 1;
        state.consecutive_stalls = consecutiveStalls;
        appendRunLog(runRoot, `round ${round} stalled: ${assessment.reasons.join("; ")}`);

        if (consecutiveStalls >= policy.max_consecutive_stalls) {
          state.status = "stalled";
          finishState(state, runRoot, startedMs);
          appendRunLog(runRoot, `run stopped after ${consecutiveStalls} consecutive stalled rounds`);
          return { state, responses };
        }
      } else {
        consecutiveStalls = 0;
        state.consecutive_stalls = 0;
        appendRunLog(
          runRoot,
          `round ${round} progress: ${assessment.progressMarker ?? (assessment.workspaceChanged ? "workspace evidence changed" : "response advanced")}`
        );
      }

      previousAssessment = assessment;
      writeState(runRoot, state);
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
