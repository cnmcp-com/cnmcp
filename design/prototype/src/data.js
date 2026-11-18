export const DOMAINS = [
  {
    "id": "video",
    "name": "视频",
    "description": "围绕视频制作交流方法、问题与发现。"
  },
  {
    "id": "game",
    "name": "游戏",
    "description": "围绕游戏制作交流玩法、开发、美术与发布。"
  }
];
export const NODES = [
  {
    "id": "solution-requests",
    "name": "求方案",
    "description": "有目标与约束，寻找可行的实现路径。"
  },
  {
    "id": "solution-sharing",
    "name": "方案分享",
    "description": "分享做法、流程、使用经验与失败复盘。"
  },
  {
    "id": "qna",
    "name": "问与答",
    "description": "交流具体操作、工具使用和报错问题。"
  },
  {
    "id": "storyboarding",
    "name": "脚本与分镜",
    "description": "讨论脚本、镜头设计与前期准备。"
  },
  {
    "id": "generation",
    "name": "素材生成",
    "description": "讨论视频画面生成、模型与镜头控制。"
  },
  {
    "id": "editing",
    "name": "视频剪辑",
    "description": "讨论视频剪辑、声音、转写与字幕处理。"
  },
  {
    "id": "automation",
    "name": "批处理",
    "description": "讨论重复操作、工作流与自动化。"
  },
  {
    "id": "gameplay",
    "name": "玩法与关卡",
    "description": "讨论游戏机制、关卡设计与试玩反馈。"
  },
  {
    "id": "engine",
    "name": "引擎开发",
    "description": "讨论游戏引擎、开发流程与工程问题。"
  }
];
export const DOMAIN_NODES = [
  {
    "domainId": "video",
    "nodeId": "solution-requests"
  },
  {
    "domainId": "video",
    "nodeId": "solution-sharing"
  },
  {
    "domainId": "video",
    "nodeId": "qna"
  },
  {
    "domainId": "video",
    "nodeId": "storyboarding"
  },
  {
    "domainId": "video",
    "nodeId": "generation"
  },
  {
    "domainId": "video",
    "nodeId": "editing"
  },
  {
    "domainId": "video",
    "nodeId": "automation"
  },
  {
    "domainId": "game",
    "nodeId": "solution-requests"
  },
  {
    "domainId": "game",
    "nodeId": "solution-sharing"
  },
  {
    "domainId": "game",
    "nodeId": "qna"
  },
  {
    "domainId": "game",
    "nodeId": "automation"
  },
  {
    "domainId": "game",
    "nodeId": "gameplay"
  },
  {
    "domainId": "game",
    "nodeId": "engine"
  }
];
export const domainName=id=>DOMAINS.find(d=>d.id===id)?.name||'全部领域';
export const availableNodes=(domainId,mappings=DOMAIN_NODES)=>NODES.filter(n=>domainId==='all'||mappings.some(m=>m.domainId===domainId&&m.nodeId===n.id));
export const nodeAvailable=(domainId,nodeId,mappings=DOMAIN_NODES)=>DOMAINS.some(d=>d.id===domainId)&&mappings.some(m=>m.domainId===domainId&&m.nodeId===nodeId);
export const topicInScope=(topic,domainId='all',nodeId='all')=>(domainId==='all'||topic.domainId===domainId)&&(nodeId==='all'||topic.nodeId===nodeId);
export const topicPath=t=>`${domainName(t.domainId)} / ${nodeName(t.nodeId)}`;
export const TAGS = [
  {
    "id": "video-generation",
    "name": "视频生成"
  },
  {
    "id": "workflow",
    "name": "工作流"
  },
  {
    "id": "subtitles",
    "name": "字幕"
  },
  {
    "id": "batch",
    "name": "批处理"
  },
  {
    "id": "local",
    "name": "本地运行"
  },
  {
    "id": "comfyui",
    "name": "ComfyUI"
  },
  {
    "id": "python",
    "name": "Python"
  },
  {
    "id": "storyboard",
    "name": "分镜"
  }
];
TAGS.push({id:'game-engine',name:'游戏引擎'});
export const DOMAIN_TAGS = DOMAINS.flatMap(d=>(d.id==='video'?['video-generation','workflow','subtitles','batch','local','comfyui','python','storyboard']:['workflow','batch','local','comfyui','python','game-engine']).map(tagId=>({domainId:d.id,tagId})));
export const availableTags=(domainId,mappings=DOMAIN_TAGS)=>TAGS.filter(t=>domainId==='all'||mappings.some(m=>m.domainId===domainId&&m.tagId===t.id));
export const tagAvailable=(domainId,tagId,mappings=DOMAIN_TAGS)=>DOMAINS.some(d=>d.id===domainId)&&mappings.some(m=>m.domainId===domainId&&m.tagId===tagId);
export const resourceTagIds=(resource,domainId='all')=>[...new Set((resource.tagAssignments||[]).filter(a=>domainId==='all'||a.domainId===domainId).map(a=>a.tagId))];
export const resourceInScope=(resource,domainId='all',tagId='all')=>(domainId==='all'||resource.domainIds?.includes(domainId))&&(tagId==='all'||resourceTagIds(resource,domainId).includes(tagId));
export const nodeName=id=>NODES.find(n=>n.id===id)?.name||'全部节点';
export const tagName=id=>TAGS.find(t=>t.id===id)?.name||'全部标签';
export const TYPES = { model: '模型', skill: 'Skill / 工作流', tool: '应用工具', library: '库 / 插件', link: '链接资源' };

export const ME = { id: 'me', name: '我', bio: '记录方法，分享过程。' };
export const SOURCES_CHECKED = '2026-11-16';
export const initialResources = [
  {
    "id": "comfyui",
    "name": "ComfyUI",
    "type": "tool",
    "summary": "以节点方式组织生成式内容的工作流。",
    "source": "https://github.com/Comfy-Org/ComfyUI",
    "repo": "Comfy-Org/ComfyUI",
    "access": "开源软件",
    "status": "listed",
    "limitation": "模型、插件和运行环境需要分别准备；能否复用他人的工作流取决于具体依赖与版本。",
    "start": "先按官方说明准备运行环境，再从一个最小工作流开始验证。",
    "facts": [
      "节点式工作流",
      "代码与插件依赖分别核对",
      "不预设具体硬件要求"
    ],
    "icon": "workflow",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "video-generation",
      "workflow",
      "local",
      "comfyui",
      "python"
    ],
    "createdAt": 101
  },
  {
    "id": "wan",
    "name": "Wan2.2",
    "type": "model",
    "summary": "视频生成模型项目，可作为镜头素材生成的候选。",
    "source": "https://github.com/Wan-Video/Wan2.2",
    "repo": "Wan-Video/Wan2.2",
    "access": "模型与权重",
    "status": "listed",
    "limitation": "不同模型变体的权重、运行要求和许可需按来源核对；不默认任意硬件都能运行。",
    "start": "从官方模型说明选择变体，用少量素材验证结果后再决定是否批量处理。",
    "facts": [
      "模型变体分别核对",
      "代码 / 权重分别记录",
      "成本与效果随条件变化"
    ],
    "icon": "model",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "video-generation",
      "local",
      "python"
    ],
    "createdAt": 99
  },
  {
    "id": "ffmpeg",
    "name": "FFmpeg",
    "type": "tool",
    "summary": "用于音视频处理，可作为转码、拼接与批量处理流程的一环。",
    "source": "https://github.com/FFmpeg/FFmpeg",
    "repo": "FFmpeg/FFmpeg",
    "access": "开源软件",
    "status": "listed",
    "limitation": "命令、编码格式和构建选项会影响实际结果；自动处理后仍需要抽查输出。",
    "start": "阅读官方文档，先用一份素材验证目标输入输出格式。",
    "facts": [
      "音视频处理",
      "输入输出格式需核对",
      "适合先验证再批量执行"
    ],
    "icon": "film",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "batch",
      "local"
    ],
    "createdAt": 97
  },
  {
    "id": "whisper",
    "name": "Whisper",
    "type": "model",
    "summary": "语音识别模型项目，可用于讨论转写与字幕工作流。",
    "source": "https://github.com/openai/whisper",
    "repo": "openai/whisper",
    "access": "模型与代码",
    "status": "listed",
    "limitation": "语言、录音质量、模型版本等会影响结果；文本与时间轴应人工核对。",
    "start": "用一段可公开的录音检查转写质量，再评估字幕整理步骤。",
    "facts": [
      "语音识别",
      "字幕需要校对",
      "模型与环境按来源核对"
    ],
    "icon": "audio",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "subtitles",
      "local",
      "python"
    ],
    "createdAt": 95
  },
  {
    "id": "vhs",
    "name": "VideoHelperSuite",
    "type": "library",
    "summary": "ComfyUI 的视频相关节点集合，用于探索视频工作流。",
    "source": "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
    "repo": "Kosinkadink/ComfyUI-VideoHelperSuite",
    "access": "开源插件",
    "status": "listed",
    "limitation": "依赖宿主与其他节点版本，不能把可引用视为已经兼容。",
    "start": "先核对宿主版本与节点说明，记录工作流需要的其他依赖。",
    "facts": [
      "ComfyUI 插件",
      "节点依赖需核对",
      "独立于具体方案"
    ],
    "icon": "blocks",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "workflow",
      "comfyui",
      "python"
    ],
    "createdAt": 93
  },
  {
    "id": "storyboard",
    "name": "分镜整理 Skill",
    "type": "skill",
    "summary": "把创作目标拆成镜头清单的社区格式示例。",
    "source": "",
    "repo": "",
    "access": "社区示例",
    "status": "listed",
    "limitation": "这是原型内的社区示例，不是已发布的真实技能包，也不承诺生成效果。",
    "start": "参考方案中的镜头字段：目标、画面、动作、时长、待验证点。",
    "facts": [
      "仅为内容结构示例",
      "不是可安装技能",
      "不调用外部模型"
    ],
    "icon": "sparkles",
    "metadataUpdatedAt": "2026-11-16",
    "tagIds": [
      "storyboard",
      "workflow"
    ],
    "createdAt": 91
  }
];
// Resource identities remain global; each domain has its own applicable tag bindings.
for(const r of initialResources){
 r.domainIds=['comfyui','ffmpeg'].includes(r.id)?['video','game']:['video'];
 r.tagAssignments=r.domainIds.flatMap(domainId=>r.tagIds.filter(tagId=>tagAvailable(domainId,tagId)).map(tagId=>({domainId,tagId})));
 delete r.tagIds;
}
initialResources.push({id:'godot',name:'Godot Engine',type:'tool',summary:'用于 2D 与 3D 游戏制作的开源游戏引擎。',source:'https://github.com/godotengine/godot',repo:'godotengine/godot',access:'开源软件',status:'listed',metadataState:'ready',domainIds:['game'],tagAssignments:[{domainId:'game',tagId:'game-engine'},{domainId:'game',tagId:'local'}],limitation:'引擎选择需要结合目标平台、团队经验与项目要求，收录不代表平台兼容性保证。',start:'从官方文档和一个最小可试玩项目开始。',facts:['简介来源：官方项目仓库','Star尚未同步'],metadataUpdatedAt:'2026-11-17',createdAt:103});

export const initialTopics = [
  {
    "id": "sample-film",
    "title": "从一张产品图到 30 秒样片：分镜、镜头生成、剪辑怎么衔接？",
    "author": "林序",
    "authorId": "lin",
    "domainId": "video",
    "nodeId": "solution-sharing",
    "body": "这是一份视频制作流程的演示方案。目标是先做出能够评审的短样片，而不是直接批量生成最终成片。\n\n我会先把画面目标拆成少量镜头，分别记录输入素材、镜头动作和检查标准，再考虑生成和剪辑。这里的工具是候选，不代表已经完成自动集成。\n\n欢迎补充你试过的衔接方式，尤其是文件格式、角色一致性和字幕校对上的失败经验。\n\n使用条件：先小范围验证；目标规格、素材来源、运行环境和可接受成本需要先明确。\n\n1. 拆成镜头\n确定画面目标，准备输入素材与检查标准。\n[分镜整理 Skill](#/resource/storyboard)\n\n2. 生成小样\n逐个检查镜头，再决定是否重复或替换资源。\n[ComfyUI](#/resource/comfyui) [Wan2.2](#/resource/wan)\n\n3. 剪辑与校对\n整理顺序、声音与字幕，抽查输出。\n[FFmpeg](#/resource/ffmpeg)\n\n结果与局限：方案草案 · 未完成真实端到端验证。所有讨论与用户为原型示例。",
    "refs": [
      "storyboard",
      "comfyui",
      "wan",
      "ffmpeg"
    ],
    "status": "open",
    "age": "刚刚",
    "createdAt": 100
  },
  {
    "id": "character",
    "title": "同一角色跨镜头总是不一致，应该换模型还是先调整制作流程？",
    "author": "阿森",
    "authorId": "sen",
    "domainId": "video",
    "nodeId": "solution-requests",
    "body": "我想先弄清楚问题出在输入素材、提示、模型选择还是后期处理。\n\n希望有实际经验的朋友分享排查顺序，以及怎样定义一次小范围测试。不需要在这里上传真实客户素材。\n\n使用条件：待补充：模型变体、参考方式、画面要求与可以接受的变化。",
    "refs": [
      "wan"
    ],
    "status": "open",
    "age": "12 分钟前",
    "createdAt": 98
  },
  {
    "id": "subtitle",
    "title": "字幕和镜头每次都要手动对齐，有哪些步骤适合先自动化？",
    "author": "小满",
    "authorId": "man",
    "domainId": "video",
    "nodeId": "editing",
    "body": "现在主要时间花在转写后的校对、字幕位置和导出检查。\n\n想先选一个最重复的环节改进。大家会从哪一步开始？\n\n使用条件：需要补充：音频语言、素材长度、时间轴格式与人工校对要求。",
    "refs": [
      "whisper",
      "ffmpeg"
    ],
    "status": "open",
    "age": "28 分钟前",
    "createdAt": 96
  },
  {
    "id": "small-batch",
    "title": "先别生成整段视频：用一个小样本检查表减少无效重试",
    "author": "周也",
    "authorId": "zhou",
    "domainId": "video",
    "nodeId": "solution-sharing",
    "body": "这条分享演示怎样记录一次试用：输入是什么、预期输出是什么、实际哪里不一致、下一步只改变哪个变量。\n\n检查清单可以独立于任何一个工具。批量处理之前，先确认一个小样本能达到什么程度。\n\n使用条件：示例方法，不提供效果提升比例，也不代表对具体工具的测评。\n\n结果与局限：方法示例 · 欢迎补充失败样本的描述方式。",
    "refs": [
      "comfyui",
      "vhs"
    ],
    "status": "open",
    "age": "1 小时前",
    "createdAt": 94
  },
  {
    "id": "offline",
    "title": "素材不能上传第三方服务，视频工具选型时怎么核对数据流向？",
    "author": "陈一",
    "authorId": "chen",
    "domainId": "video",
    "nodeId": "qna",
    "body": "希望先确认模型和工具是否依赖外部接口、插件或下载。\n\n有没有适合记录这些条件的检查方法？讨论中只描述约束，不上传任何敏感素材。\n\n使用条件：需要核对真实依赖；开源、本地运行与离线运行是不同属性。",
    "refs": [],
    "status": "open",
    "age": "2 小时前",
    "createdAt": 92
  },
  {
    "id": "found-vhs",
    "title": "发现 VideoHelperSuite：整理视频工作流时可以先核对这些节点依赖",
    "author": "木木",
    "authorId": "mu",
    "domainId": "video",
    "nodeId": "automation",
    "body": "分享这个视频相关节点集合的原始仓库。\n\n这里只介绍它可能负责的环节，不代表我已经验证所有节点或工作流。使用前请核对宿主与依赖版本。\n\nhttps://github.com/Kosinkadink/ComfyUI-VideoHelperSuite\n\n使用条件：资料分享 · 非完整亲测记录。",
    "refs": [
      "vhs"
    ],
    "status": "open",
    "age": "昨天",
    "createdAt": 90
  }
];
// Explicitly fictional prototype examples; never included in database seed.
initialTopics.push(
 {id:'game-prototype',title:'双人团队做 2D 解谜游戏，第一版原型应该保留哪些制作环节？',body:'希望先做出一个能试玩的关卡，而不是一开始就搭完整生产流程。大家通常怎样安排玩法、美术占位与版本管理？欢迎分享自己的做法。',domainId:'game',nodeId:'qna',refs:[],author:'小岛',authorId:'island',status:'open',age:'15 分钟前',createdAt:98},
 {id:'game-playtest',title:'分享一个关卡试玩记录：先记下玩家卡住的位置，再改提示',body:'这是一条演示主题。我们把试玩记录分成目标、卡点和下次调整三个部分，希望讨论怎样留下对下一轮制作有用的反馈。',domainId:'game',nodeId:'solution-sharing',refs:[],author:'阿叶',authorId:'aye',status:'open',age:'45 分钟前',createdAt:92}
);
export const initialReplies = [
    { id: 'reply-1', topicId: 'sample-film', author: '阿森', authorId: 'sen', body: '建议先拿两个差异明显的镜头试用，记录哪些条件影响结果。不要把候选列表当成已经兼容的工具链。', refs: ['wan'], helpful: 2 },
    { id: 'reply-2', topicId: 'sample-film', author: '小满', authorId: 'man', body: '我更关心中间文件怎么交接，以及每一步由谁校对。可以把这些信息放到步骤旁边。', refs: [], helpful: 1 },
    { id: 'reply-3', topicId: 'character', author: '林序', authorId: 'lin', body: '可以先补充模型变体和参考素材的使用方式，再做一次只改变一个条件的测试。', refs: [], helpful: 1 },
    { id: 'reply-4', topicId: 'small-batch', author: '木木', authorId: 'mu', body: '工作流分享时附上版本与依赖列表，会更方便其他人复现问题。', refs: ['vhs'], helpful: 1 },
];
export const initialComments = [
    { id: 'comment-1', resourceId: 'comfyui', author: '木木', authorId: 'mu', body: '使用工作流之前建议先核对缺失节点和依赖版本，遇到问题时记录最小复现条件。', topicRef: 'small-batch', helpful: 1 },
    { id: 'comment-2', resourceId: 'wan', author: '周也', authorId: 'zhou', body: '先确定变体和运行要求，再用少量镜头验证输出；不要只按模型名称判断是否适合。', helpful: 1 },
    { id: 'comment-3', resourceId: 'ffmpeg', author: '小满', authorId: 'man', body: '批处理前先确认输入输出格式和命令参数，保留原文件并抽查结果。', topicRef: 'subtitle', helpful: 1 },
];
export const initialNotifications = [
    { id: 'notice-1', title: '阿森回复了你关注的主题', text: '建议先拿两个镜头验证，再考虑完整流程。', route: '/topic/sample-film', read: false, kind: 'reply' },
    { id: 'notice-2', title: '你收藏的主题有了新讨论', text: '先别生成整段视频：用一个小样本检查表。', route: '/topic/small-batch', read: false, kind: 'follow' },
    { id: 'notice-3', title: '欢迎来到视频节点', text: '从一个具体目标开始，也欢迎分享失败经验。', route: '/guide', read: true, kind: 'system' },
];
export function createInitialState() { return { schema: 7, domainNodes: DOMAIN_NODES, domainTags: DOMAIN_TAGS, resources: initialResources, topics: initialTopics, replies: initialReplies, comments: initialComments, notifications: initialNotifications, savedTopics: [], savedResources: [], followed: [], helpful: [], reports: [], drafts: [], history: [], session: null, theme: 'light', subscribed: false }; }
export function insertResourceReference(text,start,end,resource) {
 const label=resource.name.replace(/[\[\]\n]/g,'');
 const token=`[${label}](#/resource/${resource.id})`;
 const suffix=text.slice(end);const space=suffix&&!/^\s/.test(suffix)?' ':'';
 return {text:text.slice(0,start)+token+space+suffix,cursor:start+token.length+space.length};
}
export function resourceIdsInText(text) {return [...new Set([...text.matchAll(/#\/resource\/([a-zA-Z0-9-]+)/g)].map(x=>x[1]))];}
export function normalizeRepo(input) {
    try {
        const u = new URL(input);
        if (u.protocol !== 'https:' || u.username || u.password)
            return null;
        if (u.hostname.toLowerCase() !== 'github.com')
            return null;
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length < 2 || !parts.slice(0, 2).every(p => /^[\w.-]+$/.test(p)))
            return null;
        const [owner, repo] = [parts[0], parts[1].replace(/\.git$/i, '')];
        if (!owner || !repo)
            return null;
        return { key: `${owner}/${repo}`.toLowerCase(), url: `https://github.com/${owner}/${repo}` };
    }
    catch {
        return null;
    }
}
export function extractLinks(text) { return [...new Set((text.match(/https:\/\/[^\s<>"'）)，。]+/g) || []).map(x => x.replace(/[.,;!?]+$/, '')))]; }
// Public GitHub API snapshots. Missing values remain null, never synthetic zeroes.
export const STAR_SNAPSHOTS = {
    'comfy-org/comfyui': { stars: 147061, updatedAt: '2026-11-16', source: 'https://api.github.com/repos/Comfy-Org/ComfyUI' },
    'ffmpeg/ffmpeg': { stars: 67390, updatedAt: '2026-11-16', source: 'https://api.github.com/repos/FFmpeg/FFmpeg' },
    'openai/whisper': { stars: 112802, updatedAt: '2026-11-16', source: 'https://api.github.com/repos/openai/whisper' }
};
export function normalizeResourceLink(input) {
    const github = normalizeRepo(input);
    if (github)
        return github;
    try {
        const u = new URL(input);
        if (u.protocol !== 'https:' || u.username || u.password)
            return null;
        if (!/^#(?:\/|!)/.test(u.hash)) u.hash = '';
        for (const key of [...u.searchParams.keys()])
            if (/^utm_|^fbclid$|^gclid$/i.test(key))
                u.searchParams.delete(key);
        u.searchParams.sort();
        if (u.pathname !== '/')
            u.pathname = u.pathname.replace(/\/+$/, '');
        return { key: u.href, url: u.href };
    }
    catch {
        return null;
    }
}
export function resourceSignals(db, id) {
    const refs = db.topics.filter(t => t.status !== 'hidden' && (t.refs?.includes(id) || db.replies.some(r => r.topicId === t.id && !r.hidden && r.refs?.includes(id)))).length;
    const comments = db.comments.filter(c => c.resourceId === id && !c.hidden);
    return { refs, comments: comments.length, saves: db.savedResources.includes(id) ? 1 : 0, helpful: comments.reduce((n, c) => n + (c.helpful || 0) + (db.helpful.includes(c.id) ? 1 : 0), 0) };
}

export function selectFeed(db,{view='all',domainId='all',nodeId='all',tagId='all',sort='new',unanswered=false}={}) {
 const topics=db.topics.filter(t=>t.status!=='hidden'&&topicInScope(t,domainId,nodeId)&&(!unanswered||!db.replies.some(r=>r.topicId===t.id&&!r.hidden)));
 const resources=db.resources.filter(r=>r.status==='listed'&&resourceInScope(r,domainId,tagId));
 const rows=[...(view!=='resources'?topics.map(t=>({type:'topic',item:t})):[]),...(view!=='topics'?resources.map(r=>({type:'resource',item:r})):[])];
 const activity=row=>row.type==='topic'?db.replies.filter(r=>r.topicId===row.item.id&&!r.hidden).length:db.comments.filter(c=>c.resourceId===row.item.id&&!c.hidden).length;
 return rows.sort((a,b)=>(sort==='active'?activity(b)-activity(a):0)||(b.item.createdAt||0)-(a.item.createdAt||0));
}
