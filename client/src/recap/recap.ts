import { request } from '../socket/socket';

export function recapActivity(id: string) {
  return request('recap.activity', { id });
}

/** The fast model's recap; null when no fast model is set. */
export function getRecap(id: string, fresh = false) {
  return request('recap.get', { id, fresh });
}
