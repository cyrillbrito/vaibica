import { For, Show, createMemo, createSignal } from 'solid-js';

import HomeTips from '../components/HomeTips';
import NeedsYou from '../components/NeedsYou';
import { openProjectPicker } from '../components/ProjectPicker';
import StartComposer from '../components/StartComposer';
import TopBar from '../components/TopBar';
import { Button } from '../components/ui/Button';
import Select from '../components/ui/Select';
import WorkspacePicker from '../components/WorkspacePicker';
import {
  currentTarget,
  resolveTarget,
  setCurrentTarget,
  useProjects,
} from '#lib/projects';
import { PROFILES, isProfile, type ProfileId } from '#lib/profiles';
import { useSessions } from '#lib/sessions';

export default function Home() {
  const projects = useProjects();
  const sessions = useSessions();
  const target = createMemo(() => resolveTarget(projects(), currentTarget()), {
    name: 'homeTarget',
  });
  const [profile, setProfile] = createSignal<ProfileId>('coding', {
    name: 'homeProfile',
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
                <Select
                  controlSize="lg"
                  class="shrink-0 self-start"
                  aria-label="Profile"
                  title={PROFILES[profile()].about}
                  value={profile()}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    if (isProfile(value)) setProfile(value);
                  }}
                >
                  <For each={Object.keys(PROFILES) as ProfileId[]}>
                    {(p) => <option value={p}>{PROFILES[p].label}</option>}
                  </For>
                </Select>
              </div>
              <StartComposer
                target={{
                  projectId: t().project.id,
                  cwd: t().workspace.path,
                  worktree: t().worktree,
                }}
                profile={profile()}
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
