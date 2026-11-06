// CTFd transport credentials are controller-only and must never cross into a
// solver CLI process, even if an operator accidentally exported them globally.
const CTFD_SECRET_ENV = /^(?:CTFD_.*|CTF_RACER_CTFD_.*)$/i;

export function solverEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !CTFD_SECRET_ENV.test(name)));
}
