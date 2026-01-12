
import BaseNode from './BaseNode';
import { PlaybookNodeType } from '@/types/playbook';

export const nodeTypes: Record<string, any> = {
    start: BaseNode,
    end: BaseNode,
    condition: BaseNode,
    loop: BaseNode,
    wait: BaseNode,
    use_target_list: BaseNode,
    generate_targets: BaseNode,
    filter_targets: BaseNode,
    capture_leads: BaseNode,
    navigate: BaseNode,
    analyze: BaseNode,
    scroll: BaseNode,
    extract: BaseNode,
    x_advanced_search: BaseNode,
    x_scout: BaseNode,
    x_profile: BaseNode,
    x_post: BaseNode,
    x_engage: BaseNode,
    x_scan_posts: BaseNode
};
