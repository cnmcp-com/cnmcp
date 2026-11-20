-- Taxonomy only. No fabricated users, posts, resources, Star or interactions.
INSERT INTO domains(id,slug,name,description,sort_order) VALUES
 ('video','video','视频','围绕视频制作交流方法、问题与发现。',0),
 ('game','game','游戏','围绕游戏制作交流玩法、开发、美术与发布。',10);

INSERT INTO nodes(id,slug,name,description,sort_order) VALUES
 ('solution-requests','solution-requests','求方案','有目标与约束，寻找可行的实现路径。',0),
 ('solution-sharing','solution-sharing','方案分享','分享做法、流程、使用经验与失败复盘。',10),
 ('qna','qna','问与答','交流具体操作、工具使用和报错问题。',20),
 ('storyboarding','storyboarding','脚本与分镜','讨论脚本、镜头设计与前期准备。',30),
 ('generation','generation','素材生成','讨论视频画面生成、模型与镜头控制。',40),
 ('editing','editing','视频剪辑','讨论视频剪辑、声音、转写与字幕处理。',50),
 ('automation','automation','批处理','讨论重复操作、工作流与自动化。',60),
 ('gameplay','gameplay','玩法与关卡','讨论游戏机制、关卡设计与试玩反馈。',70),
 ('engine','engine','引擎开发','讨论游戏引擎、开发流程与工程问题。',80);

INSERT INTO domain_nodes(domain_id,node_id,sort_order) VALUES
 ('video','solution-requests',0),
 ('video','solution-sharing',10),
 ('video','qna',20),
 ('video','storyboarding',30),
 ('video','generation',40),
 ('video','editing',50),
 ('video','automation',60),
 ('game','solution-requests',70),
 ('game','solution-sharing',80),
 ('game','qna',90),
 ('game','automation',100),
 ('game','gameplay',110),
 ('game','engine',120);

INSERT INTO tags(id,slug,name,description,sort_order) VALUES
 ('video-generation','video-generation','视频生成','画面与视频生成。',10),
 ('workflow','workflow','工作流','串联制作过程。',20),
 ('subtitles','subtitles','字幕','转写与字幕处理。',30),
 ('batch','batch','批处理','重复任务自动化。',40),
 ('local','local','本地运行','可在本地运行的资源。',50),
 ('comfyui','comfyui','ComfyUI','ComfyUI 生态。',60),
 ('python','python','Python','Python 技术生态。',70),
 ('storyboard','storyboard','分镜','脚本与镜头规划。',80);

INSERT INTO tags(id,slug,name,description,sort_order) VALUES
 ('game-engine','game-engine','游戏引擎','游戏开发引擎与相关工具。',90);
INSERT INTO domain_tags(domain_id,tag_id,sort_order) VALUES
 ('video','video-generation',10),('video','workflow',20),('video','subtitles',30),
 ('video','batch',40),('video','local',50),('video','comfyui',60),('video','python',70),('video','storyboard',80),
 ('game','workflow',10),('game','batch',20),('game','local',30),('game','comfyui',40),('game','python',50),('game','game-engine',60);
