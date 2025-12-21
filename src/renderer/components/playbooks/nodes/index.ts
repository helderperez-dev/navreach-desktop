
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
    navigate: BaseNode,
    analyze: BaseNode,
    scroll: BaseNode,
    engage: BaseNode,
    extract: BaseNode,
    x_search: BaseNode,
    x_advanced_search: BaseNode,
    x_like: BaseNode,
    x_reply: BaseNode,
    x_post: BaseNode,
    x_follow: BaseNode,
    x_engage: BaseNode,
    mcp_call: BaseNode,
    api_call: BaseNode,
    browser_action: BaseNode,
    humanize: BaseNode,
    approval: BaseNode,
    pause: BaseNode,
};
