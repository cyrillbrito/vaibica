import { Button } from './Button';
import Empty from './Empty';
import { AlertIcon, RefreshIcon } from './icons';

/** What an error boundary shows: the reason, quietly, in place of the area. */
export default function Failed(props: { error: unknown }) {
  return (
    <Empty
      danger
      icon={<AlertIcon />}
      title="Something went wrong"
      action={
        <Button size="md" variant="outline" onClick={() => location.reload()}>
          <RefreshIcon /> Reload
        </Button>
      }
    >
      <span class="break-words">
        {props.error instanceof Error
          ? props.error.message
          : String(props.error)}
      </span>
    </Empty>
  );
}
