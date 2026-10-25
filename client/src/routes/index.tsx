import { Show, createMemo, createSignal } from 'solid-js';

import HomeTips from '../app/HomeTips';
import NeedsYou from '../sessions/NeedsYou';
import { openProjectPicker } from '../projects/ProjectPicker';
import StartComposer from '../sessions/StartComposer';
import TopBar from '../app/TopBar';
import { Button } from '../ui/Button';
import { AssistantIcon } from '../ui/icons';
import WorkspacePicker from '../projects/WorkspacePicker';
import {
  currentTarget,
  resolveTarget,
  setCurrentTarget,
  useProjects,
} from '../projects/projects';
import { useSessions } from '../sessions/sessions';

const ASSISTANT_HINT =
  'Assistant mode: for a session that keeps going, such as notes or a small coordinator in this project. It compacts on its own and keeps memory in files. Less about code, more about help.';

export default function Home() {
  const projects = useProjects();
  const sessions = useSessions();
  const target = createMemo(() => resolveTarget(projects(), currentTarget()), {
    name: 'homeTarget',
  });
  const [assistant, setAssistant] = createSignal(false, {
    name: 'homeAssistant',
  });
  let call = () => {};

  return (
    <>
      <TopBar />
      <div class="chat-column flex flex-1 flex-col justify-center gap-6 pb-[15vh]">
        <h1 class="text-center text-display font-semibold tracking-tight">
          What are we building?
        </h1>
        <Show
          when={target()}
          fallback={
            <Button
              class="mx-auto"
              variant="primary"
              onClick={openProjectPicker}
            >
              Add a project to start
            </Button>
          }
        >
          {(t) => (
            <div class="flex flex-col gap-2">
              <div class="flex min-w-0 gap-1">
                <WorkspacePicker
                  project={t().project}
                  workspace={t().workspace}
                  worktree={t().worktree}
                  onChange={setCurrentTarget}
                  onAdd={openProjectPicker}
                />
                <Button
                  size="lg"
                  class="self-start aria-pressed:bg-active aria-pressed:text-fg"
                  title={ASSISTANT_HINT}
                  aria-pressed={assistant() ? 'true' : 'false'}
                  onClick={() => setAssistant(!assistant())}
                >
                  <AssistantIcon />
                  Assistant
                </Button>
                <Show when={assistant()}>
                  <span class="min-w-0 self-center truncate text-meta text-muted">
                    Long-running, with memory
                  </span>
                </Show>
              </div>
              <StartComposer
                target={{
                  projectId: t().project.id,
                  cwd: t().workspace.path,
                  worktree: t().worktree,
                }}
                agent={assistant() ? 'assistant' : 'coding'}
                draft="new"
                ref={(api) => (call = api.call)}
              />
            </div>
          )}
        </Show>
        {/* What needs you, else first steps while nothing is going on. */}
        <Show
          when={sessions().some((s) => !s.archivedAt)}
          fallback={<HomeTips onVoice={() => call()} />}
        >
          <NeedsYou />
        </Show>
      </div>
    </>
  );
}
