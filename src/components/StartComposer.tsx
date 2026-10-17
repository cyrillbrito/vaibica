import { useNavigate } from '@solidjs/router';

import { updateSettings, useModels } from '#lib/models';
import type { ProfileId } from '#lib/profiles';
import type { PromptImage } from '#lib/protocol';
import { startSession } from '#lib/sessions';
import { startCall } from '#lib/voice';
import { paths } from '../router';
import Composer, { type ComposerApi } from './Composer';
import ModelPicker from './ModelPicker';
import { IconButton } from './ui/Button';
import { VoiceIcon } from './ui/icons';

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
  profile?: Exclude<ProfileId, 'hub'>;
  // Where the typed draft is kept, e.g. "new" on the home page.
  draft: string;
  placeholder?: string;
  // For a voice button elsewhere on the page, like the home tips.
  ref?: (api: { call: () => void }) => void;
}) {
  const navigate = useNavigate();
  const models = useModels();
  // New sessions start with the saved defaults; picking here changes them.
  const choice = () => ({
    model: models().settings.model,
    thinkingLevel: models().settings.thinkingLevel,
  });

  const create = async (prompt: string, images: PromptImage[]) => {
    const t = props.target;
    if (!t) throw new Error('No project');
    const id = await startSession(
      t.projectId,
      t.cwd,
      prompt,
      images,
      choice(),
      t.worktree || undefined,
      props.profile ?? 'coding',
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
      onSend={create}
      draft={props.draft}
      ref={(api) => (composer = api)}
      placeholder={props.placeholder ?? 'Start a new session…'}
      actions={
        <IconButton size="md" title="Start with a voice call" onClick={call}>
          <VoiceIcon />
        </IconButton>
      }
      controls={<ModelPicker value={choice()} onChange={updateSettings} />}
    />
  );
}
