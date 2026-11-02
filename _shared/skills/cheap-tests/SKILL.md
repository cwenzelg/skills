---
name: cheap-tests
description: How to write automated tests that stay cheap to run - one shared container or server per run, no per-class instance starts, no concurrent suites, no real sleeps, no real audio or network, and a test run capped at 2 workers. Use whenever you write, add or change a test (unit, integration, Vitest, JUnit, Swift Testing, node:test), a test base class, a fixture or a test configuration, even when the task only says "add a test".
---

# Cheap tests

Every test run in this cluster is capped at **2 workers** (Vitest `--maxWorkers=2`, Gradle `--max-workers=2`, node `--test-concurrency=2`, xcodebuild at most 2 test workers). Up to six tasks run at the same time, so a test that starts its own instances or its own parallel suite multiplies the load on one machine and turns other tasks' runs red (host load, 5 s timeouts). The Dev Manager flags the shapes below in a new test and sends it back once.

## Rules

- **One shared container or server per run.** Extend the repo's shared integration-test base (one Postgres/MySQL container for the whole JVM). Never `@Container` or `new ...Container(...)` in a single test class; never one HTTP server per test (open it in a shared `beforeAll`, close it in `afterAll`). If no shared base exists, create one and let your class extend it. Reason: a container start costs 3-5 s and ~500 MB, six classes are six of them.
- **Few groups, not many.** One `describe` per unit; do not split one subject into many files that each boot the framework (Nuxt environment, Spring context). Reason: every boot is paid once per file and worker. A new Spring context per class (different `@MockBean` / properties) is a new application start - share the configuration.
- **No concurrent suites.** No `describe.concurrent` / `it.concurrent`, no `@Execution(CONCURRENT)`, no `maxParallelForks` above 1, no `Promise.all` over many heavy cases. The runner is already parallel up to the cap. Reason: the cap is per run; your own parallelism steps over it.
- **No test starts a test runner.** A test never runs `node --test`, `vitest`, `gradlew` or `xcodebuild` itself. Test the function the runner would call, or stub the runner. Reason: that is a second suite inside the capped run.
- **No real waits.** No `sleep`, `Thread.sleep`, `waitForTimeout`, `setTimeout` waits. Use fake timers (`vi.useFakeTimers()`), a latch/Awaitility on the condition, or an injected clock. Reason: a 2 s sleep times 40 tests is 80 s of an idle worker.
- **No real audio, network, mail or external service.** Stub the transport (`URLSession` stub, MSW, a fake gateway); a silent synthesizer for speech. Reason: slow, flaky, and it breaks offline and in parallel runs.
- **Own your cleanup.** Whatever the test starts (server, temp dir, timer, subprocess) it stops itself, by handle, in `afterAll`; never by killing a name or port.
- **Fast first.** A pure-function test beats a mounted component beats a full-stack test; pick the cheapest level that can fail for the right reason.

## Check before you finish

- `grep -n "@Container\|new .*Container(\|\.concurrent\|Thread.sleep\|waitForTimeout\|setTimeout" <your test files>` finds nothing you cannot justify.
- Run only your tests (targeted), once; the Technical Tester runs the full suite.
- Slowest tests are recorded per run (`.state/dev-manager-test-timing.jsonl`); a new test that lands in the top 10 of its repo needs a reason in your report.
