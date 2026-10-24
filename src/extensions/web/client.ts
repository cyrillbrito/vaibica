import { GlobeIcon, SearchIcon } from '../../components/ui/icons';
import { defineClientExtension } from '../contract';
import { web as manifest } from './meta';

export default defineClientExtension({
  manifest,
  tools: {
    web_search: { label: 'search', icon: SearchIcon },
    web_fetch: { label: 'fetch', icon: GlobeIcon },
  },
});
