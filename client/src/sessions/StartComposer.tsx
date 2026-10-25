import { useNavigate } from '@solidjs/router';
import { createSignal } from 'solid-js';

import { useModels } from '../models/models';
import type { AgentId } from '@bica/shared/agents';
import type { PromptImage } from '@bica/shared/protocol';
import { startSession } from './sessions';
import { startCall } from '../voice/voice';
import { paths } from '../router';
import Composer, { type ComposerApi } from './Composer';
import ModelPicker from '../models/ModelPicker';
import { IconButton } from '../ui/Button';
import { MoonIcon, VoiceIcon } from '../ui/icons';

export interface StartTarget {
  projectId: string;
  cwd: string;
  worktree?: boolean;
}

/**
 * The composer for a new session: send, or start with a voice call, and
 * land in the session. Used on the home page and on a workspace's page.
 */
export default function StartComposer(props: {
  target: StartTarget | undefined;
  // Absent: coding.
  agent?: Exclude<AgentId, 'hub'>;
  // Where the typed draft is kept, e.g. "new" on the home page.
  draft: string;
  placeholder?: string;
  // For a voice button elsewhere on the page, like the home tips.
  ref?: (api: { call: () => void }) => void;
}) {
  const navigate = useNavigate();
  const models = useModels();
  // Picking here sets only the session about to start; Settings holds the
  // default, so one session's pick never leaks into the next.
  const [choice, setChoice] = createSignal(
    () => ({
      model: models().settings.model,
      thinkingLevel: models().settings.thinkingLevel,
    }),
    { name: 'startChoice' },
  );

  // tonight: held for the night run (docs/night-runs.md) instead of sent.
  const create = async (
    prompt: string,
    images: PromptImage[],
    tonight = false,
  ) => {
    const t = props.target;
    if (!t) throw new Error('No project');
    const id = await startSession(
      t.projectId,
      t.cwd,
      prompt,
      images,
      choice(),
      t.worktree || undefined,
      props.agent ?? 'coding',
      tonight || undefined,
    );
    navigate(paths.s(id));
    return id;
  };
  let composer: ComposerApi | undefined;
  // An empty session with a call on it: the first thing said is the prompt.
  const call = () => {
    const id = create('', []);
    id.catch((error) =>
      composer?.problem(error instanceof Error ? error.message : String(error)),
    );
    void startCall(id);
  };
  props.ref?.({ call });

  return (
    <Composer
      onSend={(prompt, images, _steer, tonight) =>
        create(prompt, images, tonight)
      }
      draft={props.draft}
      ref={(api) => (composer = api)}
      placeholder={props.placeholder ?? 'Start a new session…'}
      actions={
        <>
          <IconButton
            size="md"
            title={`Run tonight at ${models().settings.nightStart}, on its own, and report in the morning`}
            onClick={() => composer?.sendAlternate()}
          >
            <MoonIcon />
          </IconButton>
          <IconButton size="md" title="Start with a voice call" onClick={call}>
            <VoiceIcon />
          </IconButton>
        </>
      }
      controls={<ModelPicker value={choice()} onChange={setChoice} />}
    />
  );
}
