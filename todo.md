TODO 1. （状态：已完成）
接入诗歌api (https://poetry.palemoky.com/api/poems/random) 并在 profile dashboard 右下角下面增加小字标注出处 "——《xxx》"

TODO 2. （状态：已完成）
日历里的待办事项、事件安排和mindmap里的日期标注，怎么感觉不是同一套东西？如果确实不是，就保留mindmap的，日历本身的那些，注释掉即可

TODO 3. （状态：已完成）
workspace很久之前写的日历脚本可以入土了，删除相关注释、描述内容

TODO 4. （状态：已完成）
AI Chat 对话页内，右侧边加一个deepseek网页版那样的用户query bar（已经query出去的，点击可以自动滑动到那个对话开始（用户问的位置））
这个bar有什么功能以及怎么才能显示需要用户说明一下
在完成todo4之前，需要先将sidebar进行一点拆分，现在sidebar上面是有一个header的（放置了MyWorkspace的icon和用户头像）
将这个部分拆分出sidebar，因为需要修改ai-chat view布局，不再显示sidebar，但header仍保留，ai页面原本的（工作台）title删除。
点击全能工作台图标或文字可以再次呼出悬空sidebar（类似显示空间不足时额外显示的按钮）
（另外这个可折叠sidebar我发现同时存在折叠按钮和删除按钮，请仅保留折叠按钮，删除删除按钮）

sidebar不显示后，整体ai聊天栏就可以左移
这个query bar放在ai聊天栏界面外右侧居中多出来的位置，这个bar默认不显示，当鼠标靠近时显示，总占的大小约为聊天框，水平方向最大屏幕1/9大小，title超出了则slice换三个点结尾截断
query bar里最多显示最近9条用户提问，title均靠右显示，在用户当前所处的对话对应的title旁，增加一个蓝色nav横标装饰（超出显示范围后隐藏不显示），同时title本身变为蓝色。
query bar支持上下滑动。
title默认颜色都是灰色。
query bar里的title均可点击，点击后自动0.5s动画移动到对应的对话开头，鼠标hover在title上可将颜色transition 0.1s改为白色显示。（除当前title外）离开hover再transition 0.1s改回灰色。

TODO 6. （状态：已完成）
AI Chat 里，没有对用户输入内容框/AI输出内容框做单行显示长度限制（最大对话页面的3分之2长度，超出应强制换行）

TODO 7. （状态：已完成）
AI Chat 里，用户输入内容过长/AI输出内容过长超出限定显示范围时出现的horizontal滑条不符合sidebar风格的滑条
考虑将内容溢出出现的滑条的编写规范写到agents.md或其他文档里，问题多次出现了

TODO 8. （状态：已完成）

todo -> github 式热力图（每天新建了多少节点，完成了多少节点）
这些得量化成一个个 Contribution，方便计量，不要直接用节点数字！

设计成类似下面的形式：（如果有缺漏可以提出，注意这个需要持久化数据）

```ts
interface Contribution {
  id: string // 方便对同一个contribution进行操作
  amount: number // 浮点数
  type: ContributionType // 类型，如mindmap新建节点，完成节点
  content: String // 原因或者说，具体内容
}
```

统计每天的 contribution（这里的每天需要注意：需要到了用户时区的第二天04:00才开始第二天的统计，在第二天04:00之前属于第一天）
（同时这个04:00的offset需要加入到settings里允许配置）

然后在 profile dashboard 里的 activity & contributions 里显示出来
（注意 amount 显示在格子hover里显示为四舍五入的整数形式）

未来还会有更多的 contribution type （如 TODO 9）

TODO 9. （状态：已完成）
完成profile dashboard 里的签到功能
当按下签到功能后，弹出toast弹窗提出签到成功，签到按钮同步增加暗色图层，文字改成“√已签到”
签到每天04:00重置（用户时区）（采用 TODO 8 同一个offset配置）
每次点击签到，都添加一个 Contribution，amount 为 2

TODO 10. （状态：已完成）
在 profile dashboard 里增加一个"专注钟"，可以设置正计时和倒计时两种，对于倒计时可以设置专注的时间
开始计时后，在专注钟内显示一个暂停和一个结束按钮，暂停表示暂时停止计时，结束表示结束计时并将时间计入contribution
这个contribution的amount由时间决定，10分钟 -> 1 contribution，不足10分钟的部分不计入统计

TODO 11. （状态：已完成）
很多文档里存在行数定位，这些都不应存在，应当以方法名/属性名等定位，其他文档可能存在类似问题，需要同样修改。

TODO 12. （状态：已完成）
在 Activity & Contributions 下添加类似github一样的，contribution 详情
单次显示最多 5 条（如没有则显示 居中灰色字"暂无活动记录"）
每一条的显示形式为大卡片（参考类型如下）：

1. 整体布局与主题 (Layout & Theme)
深色模式 (Dark Theme): 背景采用了深灰色（近似 #1e1e1e 或 #222），而非纯黑。这种设计可以减轻视觉疲劳，同时让文字和彩色标签更突出。

容器化 (Card/Container): 内容被包裹在一个带有圆角的容器中，通常通过 border-radius (如 12px 或 16px) 实现，并且可能带有极细的边框或轻微的阴影以与背景区分。

灵活布局 (Flexbox/Grid):

顶部标题栏（标签、标题、日期）使用了水平排列，非常适合使用 display: flex; justify-content: space-between; align-items: center; 来实现。

下方的信息列表（时间、地点、人物等）采用了“左侧固定宽度标签 + 右侧自适应内容”的布局，这可以通过 Flexbox 或 Grid 轻松实现。

2. 色彩与对比 (Color & Contrast)
文字色彩层级:

主标题: 纯白色 (#ffffff)，字重较大，吸引第一眼注意力。

标签字段 (如时间、地点): 使用了中灰色（如 #999 或 #aaa），降低视觉层级。

正文内容: 浅灰色（如 #ccc 或 #ddd），保证在深色背景上的阅读舒适度。

强调色 (Accent Colors):

左上角的“国内”标签使用了暗红色背景搭配亮红色文字。

正文中的关键词（“甲醛溶液”、“三部门”）使用了高饱和度的红色/橙色（类似 #e63946 或 #ff5722）。这在CSS中通常通过给 <span> 标签单独设置 color 属性来实现。

3. 排版与字体 (Typography)
字体家族 (Font Family): 采用了典型的无衬线字体（Sans-serif），如系统默认的 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif，保证屏幕阅读的清晰度。

行高 (Line-height): 正文部分的行高设置得比较宽松（如 1.6 或 1.8），这是提升大段文字可读性的关键CSS属性。

对齐方式 (Text Align):

顶部的日期使用了右对齐 (text-align: right)。

正文列表呈现两端对齐或左对齐的视觉效果。

4. 具体组件样式 (Component Styles)
胶囊标签 (Pill Badges):

左上角的“国内”和右上角的日期都呈现胶囊形状，通过 border-radius: 999px;（或较大数值）实现。

右上角的日期背景有轻微的填充色，可能是 background-color: rgba(255,255,255,0.1);，边缘有细边框。

列表项间距 (Spacing): 信息列表每一项（时间、地点等）之间有明显的垂直间距，通常通过 margin-bottom 或 Flexbox 的 gap 属性控制。

继续todo：
然后添加一个github那样的下展开按钮，点击可以继续显示最多5条，如果已经显示完，则删除下展开按钮并显示"无更多活动记录"

TODO 13. （状态：已完成）
现在每次点击进入关系类图都是进入到原点，需要保存上次浏览的scale及x,y，下次进入时直接进入到这个x，y，scale。

TODO 14. （状态：已完成）
现在诗歌在profile dashboard 里是有背景的，需要删除背景，改为悬空文字显示

TODO 15. （状态：已完成）
现在设置界面的东西太杂太乱了，而且弹窗的空间有点不够用，改为使用 settings view，并重新安排所有按钮的位置
需要分为以下几个类别
一、通用 / 基础
外观主题：浅色 / 深色 / 跟随系统
语言：界面语言切换 // 尚未实现，但预保留显示“中文”
字体与字号：界面字体、字号
启动行为：启动时默认打开的view / 打开上次的view
二、快捷键 / 键位
自定义快捷键
三、账户与同步
登录：账号信息、头像、国家（即 profile dashboard 里现在显示的） // 需要注意，登录目前是没有实际用途的，只是作为显示信息
版本信息
开源软件许可证
数据导入导出
四、高级 / 开发者
配置文件：直接编辑 JSON / YAML
五、其他
（其他配置）

TODO 16. （状态：已完成）
mindmap节点的右键contextmenu：
1. 添加子节点
2. 标记已完成
3. 添加标签
4. 节点风格
- 边框
- 背景
5. 截止日期

TODO 17. （状态：已完成）
给ai对话框两边内容添加文字朗读功能？

- 一句话：用浏览器自带 speechSynthesis 实现（lib/tts.ts），零 API 依赖。

TODO 18. （状态：已完成）
新增消息通知
主要涉及github通知，每5分钟扫一遍指定仓库的新commit/issue/pr/release（从 这个工作台应用关机时间或当前时间（前者优先，没有数据就后者） 开始算的就算新，然后注意更新最新时间）（可以指定扫的范围：选择commit, issue, pr, release的其中几个）
然后扫描commit的话，如果committer和用户设置的本地名称一致，则认为这是一个contribution，1个commit计1个contribution，加入到profile的热力图中。
issue/pr同理，committer一致的话，就计2个contribution/每issue或pr

TODO 19. （状态：已完成）
接下来，你需要给sidebar里的内置模板增加一个折叠，默认不展开

TODO 20. （状态：已完成）
工具下面新增一个通知，用于自动收集各方通知（如 TODO 18 的 github 通知）
目前只需要支持内置的sender，如 TODO 18 的 github 通知，内容显示上参考AI对话页面即可，但去掉头像且用户不可回复，如有需要可以抽象接口等操作
未来sender会更多样，需要做好可拓展性。
有sender发送消息时，右下角滑入一个消息弹窗，显示sender名称，然后下方内容最多2行，且每行最多20字，多了就"..."截断
弹窗停留显示5秒
弹窗右上角有小灰x点击可以提前关闭消息弹窗（滑出）
点击消息弹窗可以跳转到消息页面
需要对接 ai 功能，写对应的 built-in skill: 用于获取最近24小时的消息/最近7天的消息
若同时有多条消息收到，则弹窗逐个排队显示。

TODO 21. （状态：已完成）
目前来看，github预览略微能用，但是这个 opengraph
怎么抓了个仓库的，我想抓 issue / pr / release 等的本身
然后这个预览卡片里显示了未知和NaN 未知是什么， NaN的原因是？

然后我想 b站的预览和github的预览是，文字在上，图片在文字下方，顺序要改改。

TODO 22. （状态：已完成）
通知方式（通道 / notifier）可配置：目前 sender 产生消息后只有「内置右下角弹窗」一种投递方式。
未来会新增 QQ 互联等通道，通知方式将包括内置通知和 QQ 通知两种或更多。
需要把投递层抽象成统一的 notifier 接口（sender → 事件 → 按 用户配置 分发给启用的 notifier），
弹窗（内置通知）只是其中一种 notifier 实现；通知方式的选择 UI 放设置页「通知」分区。

TODO 23. （状态：已完成）
通知中心多 sender 支持：当前数据源只有内置的 GitHub sender，未来可能接入更多消息源
（如新闻页：定时获取新闻并推送为通知）。sender 抽象已预留 senderId（lib/notifications/senders.ts 有展示注册表），
需要完善：多 sender 的注册与启停管理、通知中心按 sender 筛选/分组展示、每个 sender 各自的配置分区等。

接下来，我想在通知里增加一个自动新闻获取，每天最多触发一次。（18:00之后为分隔这里的1天）
新闻获取可以在设置里开关，默认开启。
这个触发是自动开启一个ai对话，让ai选择合适的文章总结.
工作流如下：
首先需要从5个 type（bilibili/zhihu/zhihu-daily/douyin/thepaper） 获取基本的 response，
(以下是一个示例，见todo34)
import { UapiClient } from 'uapi-sdk-typescript';
async function main() {
  const client = new UapiClient('https://uapis.cn');
  const payload = {
    type: "weibo",
  };
  const response = await client.misc.getMiscHotboard(payload);
  console.log(response);
}
main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
返回格式：
{
  "type": "weibo",
  // 热榜更新时间，UTC 时间（ISO 8601 格式，以 Z 结尾）。时光机模式下对应返回快照的更新时间。
  "update_time": "2026-03-20T21:39:16.000Z",
  // 时光机模式返回的快照实际时间戳（毫秒）。当前热榜模式下通常不返回。
  "snapshot_time": 1700000000000,
  // 热榜条目列表。
  "list": [
    {
      // 额外信息，不同平台该字段内容不同，例如微博热搜的标签（如“新”“爆”）。
      "extra": {},
      "hot_value": "1234567",
      "index": 1,
      "title": "今天天气真好",
      "url": "https://s.weibo.com/weibo?q=%23%E4%BB%8A%E5%A4%A9%E5%A4%A9%E6%B0%94%E7%9C%9F%E5%A5%BD%23",
      // 封面图 URL，音乐类热榜返回专辑封面，其他平台一般不返回。
      "cover": "https://p1.music.126.net/xxx/109951170483249998.jpg"
    }
  ]
}
提取所有的 title,url,hot_value,extra 后，数据提供给ai，并让ai选择10个（在精不在多，可以不足10个）最有价值的以类似以下的形式返回 json，并由程序本体读取json生成若干则通知
{
  "field": "国内/国外",
  "title": "西藏吉隆冰崩泥石流灾害：冰湖溃决冲击边境口岸",
  "time": "2026年8月27日—9月上旬",
  "place": "西藏日喀则市吉隆县·吉隆口岸（G216国道），灾害源头在尼泊尔一侧万年冰川",
  "individuals": "受灾群众与边境建设者；西藏消防、武警、交通抢险力量；科研团队",
  "throughout": "尼泊尔一侧冰川发生冰岩崩，融水裹挟泥沙形成冰川洪流，冲击中尼边境的吉隆口岸；G216国道被冲毁中断，抢险在峭壁与急流之间展开——水中"填"路、爆破清障。至9月3日确认21人遇难，遇难者中暂未发现外国人遗体。",
  "effect": "全国重点实验室公布灾害初步研判报告。专家提醒：全球变暖正加速冰川消融，而现有冰湖预警体系无法监控冰川崩塌，"冰冻圈灾害"成为全人类必须共同面对的新风险。",
  "spirit": "迎难而上、不畏艰险的抢险担当，以及敬畏自然、守望相助的人类命运共同体意识。",
  "essay_example": "当万年冰川在暖化中崩裂，冰川洪流冲毁G216国道，西藏消防、武警与交通抢险力量却在峭壁与急流之间，以水中"填"路、爆破清障的决绝，为边境群众和建设者打通生命通道。吉隆口岸的这场灾害警示我们：全球变暖之下，"冰冻圈灾害"正成为全人类必须共同面对的新风险——面对自然，人类既要有迎难而上的勇气，更要有携手同行的清醒。",
  "link": ["https://search.bilibili.com/all?keyword=西藏吉隆口岸冰岩崩", "https://s.weibo.com/weibo?q=%23%E4%BB%8A%E5%A4%A9%E5%A4%A9%E6%B0%94%E7%9C%9F%E5%A5%BD%23"]
}

TODO 24. （状态：已完成）
设置页面改版
改为更 modern 的软件页面（这个todo还没写完以后再写） @todo 24

TODO 25. （状态：已完成）
重构页面，将其改为类似 Codex 的页面
具体为：
左下角新增一块区域为"工具栏"，里面直接放置每个工具卡片（可收起），大小为：AI页面输入框的高度及其左侧全部区域

现在打开主界面后，默认直接打开 AI 对话页面（打开新对话或最新页面）

将所有分类内容（添加分类，内置模板，分类具体内容）全部合并为一个"随笔"工具，放在工具下。

sidebar改为可收起，占用空间减小到工具栏的上面及原有宽度
对于随笔工具，点击后可以在sidebar改为显示原有的所有分类内容。（添加分类，内置模板，分类具体内容）
对于点击AI对话工具，则在sidebar改为显示原有AI对话列表的内容。

TODO 26. （状态：已完成）
加一个喝水提醒，自启动起每隔2小时就右下角通知弹窗提醒要喝水了（显示99999秒，直到用户点击关闭）
再加一个站立提醒，自启动起每隔4小时就右下角通知弹窗提醒不能久坐要站立了（显示99999秒，直到用户点击关闭）

TODO 27. （状态：已完成）
新增日志存储，如 GitHub 监听仓库需要日志记录当前检查了哪个commit/issue/pr/release等，然后说明要不要发送通知提示

TODO 28. （状态：已完成）
增加一些内链访问。。。自动跳转到某个AI对话、思维导图节点等

- 一句话：内链标记协议 `[[mw:conv:{会话id}|标题]]` / `[[mw:node:{族id}:{节点id}|标题]]`，编辑态显示原文不渲染。

TODO 29. （状态：已完成）
AI 接入联网搜索

TODO 30. （状态：已完成）
github issue 卡片预览无效，但pr预览却可以显示，调查原因

TODO 31. （状态：已修复）
仅监听应当仅针对 commit 有效，不对issue/pr生效

TODO 32. （状态：已完成）
使rich-text支持文本颜色更改范式？并将这个写成skill放built-in里，再在系统提示词里引导ai使用这些格式代码（还有markdown的斜体粗体等更多功能不需重复实现，引导ai即可）
如
<blue>蓝色的字</blue>
需要有基础的16色
参考：
https://zh.minecraft.wiki/w/%E6%A0%BC%E5%BC%8F%E5%8C%96%E4%BB%A3%E7%A0%81#%E9%A2%9C%E8%89%B2%E4%BB%A3%E7%A0%81

TODO 33. （状态：已完成）
1. 设置里有个生日没有被持久化的，然后这个设置应该放到账户里面去
2. 将设置里的通知改为 GitHub 集成，高级里的Github令牌放到这里第一个。
3. 允许在账户与同步里更改名称，头像，地理位置（原有在个人主页的修改头像和地理位置的功能删除）
4. AI 助手中的用户头像放到账户与同步里，不再需要
5. Git 本地名称直接用名称，不用再单开一个，旧数据不再保留。

TODO 34. （状态：已完成）
authorization Bearer 在设置中设置（UAPI 令牌） // 没有 Bearer 时也可以访问，可选的
更换天气接口：（2小时获取1次或用户手动点击刷新时获取）
官方sdk接口：
https://github.com/AxT-Team/uapi-sdk-typescript
import { UapiClient } from 'uapi-sdk-typescript';
async function main() {
  const client = new UapiClient('https://uapis.cn');
  const payload = {
    city: "", // 不要提供，接口会自动获取
    adcode: "",
    extended: false,
    forecast: false,
    hourly: false,
    minutely: false,
    indices: false,
    lang: "zh",
  };
  const response = await client.misc.getMiscWeather(payload);
  console.log(response);
}
main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
返回格式：
{
  // 省份
  "province": "北京市",
  // 城市名
  "city": "北京",
  // 区县或更细一级的行政区名称。自动按 IP 定位时更常见。
  "district": "海淀区",
  // 行政区划代码（部分数据源可能为空）
  "adcode": "",
  // 天气状况描述。默认返回中文，传 `lang=en` 时返回英文。非固定枚举。
  "weather": "晴",
  // 天气图标代码。请从[天气图标代码表](#enum-list)中查看所有可能的值。
  "weather_icon": "100",
  // 当前温度 °C
  "temperature": 18.3,
  // 风向
  "wind_direction": "西南风",
  // 风力等级
  "wind_power": "微风",
  // 相对湿度 %
  "humidity": 20,
  // 数据更新时间
  "report_time": "2026-02-19 15:25:58",
  // 官方气象预警列表（存在有效预警时返回）
  "alerts": [
    {
      // 预警标题
      "title": "string",
      // 预警类型，如雷电、暴雨
      "type": "string",
      // 预警级别，如蓝色、黄色、橙色、红色
      "level": "string",
      // 预警正文
      "text": "string",
      // 预警发布时间
      "publish_time": "string",
      // 发布单位
      "publisher": "string",
      // 防御指引列表
      "guidance": [
        "string"
      ]
    }
  ]
}
（收到429时，即访问过快，需要前端内部限制并提示10分钟后再调用访问）

TODO 35. （状态：已完成）
B 站视频预览不应主动播放视频

TODO 36. （状态：已完成）
写一个 issue/pr queue（类似github那样的我觉得不错），悬挂各种issue上去（显示提交者，标题，内容截取）。然后分 Urgent Issue/PR，Assigned Issue/PR，Completed Issue/PR 等列。
issue由用户自己添加，可以添加一整个仓库全部issue/pr（单次最多100条防止github限制，超出则弹窗提示），也可以只添加assign到自己的指定仓库的issue/pr，
Github监听也可以联动一下这里的queue
另外写成skill，ai可以获取里面信息，或访问issue里面内容（访问可能得看看行不行？当然这个ai功能暂时不重要，开个新的todo以后再做）

TODO 37. （状态：已完成）
文档（docs/和AGENTS.md）很久没有更新过了，是需要更新一下（todo 11）
需要说明规范是
1. 禁止一切行数标记，只能以文件名，字段名，方法名，库名为索引。
2. 列表写明所有持久化字段，一句话说明。
如
| 持久化字段 | 说明 |
3. 一切文档非必要不能用内嵌式说明，不能突然蹦出一个字段然后一大串括号解释，而应是都以下面额外添加一个表格来"一句话"说明。
4. 一切文档应当都应尽可能**以功能为划分**，先列出所有功能，再分别聚焦**什么功能在什么地方**，**数据传输链路**，相关 see also，notice等。
5. 你在扫描文件时也注意源文件注释，**可能**过度冗余，尽可能以一句话或简短的话来修改源代码里的注释

TODO 38. （状态：已完成）
现在Tiptap代码块渲染部分有点小了呢，字号调大点，然后加上显示行数和语言

TODO 39. （状态：已完成）
个人主页里面有一个待办事项，在这里加一个ai按钮，然后点击就可以 askAiAbout，引导ai结合具体各项skill支持访问的数据来综合给出待办事项，再切到对应对话。

TODO 40. （状态：已完成）
多语言支持，找找有没有现成库吧

- 一句话：react-i18next 方案，13 批全站抽取完成，en.ts 与 zh 同构（931 key），`{lang:key}` 正文占位符编辑态不替换。

TODO 41. （状态：已完成）
导出增加一个可以选择导出哪些内容，包括AI对话数据，随笔数据，日历数据，联系人数据，密码保险，通知数据，github队列数据（等等的，未来如果写新功能也要加进来，需要添加到docs中说明），比如联系人（todo 48）和密码这些敏感信息可以选择导出时不顺带（默认就这2个不携带导出）

TODO 42. （状态：已完成）
消息过多时（堆积超过3条），不再逐个弹toast，而是只显示一条：
你有 x 条新消息

TODO 43. （状态：待处理）
加一个"方法论"大全，专门整理我以前是怎么解决什么问题的。。。类似博客吗，可能又需要一个界面重构，需要先参考看看别人博客怎么写的。
洛元的很好，我觉得。

TODO 44. （状态：已完成）
新闻精选先改为只能手动触发，现在他每条新闻都发1个通知，以后再调整他的发送，改成1个通知包，里面内含10个通知，外面只统计有1个通知包，qq互联也是整个包发过去而不是逐条通知发。
另外 AI 功能是可能失败的（如 HTTP 429），这需要额外发一个通知说明新闻精选运行失败。

TODO 45. （状态：已完成）
通知页面里的卡片里的单行文字过长会超出框，需要加截断

TODO 46. （状态：已完成）
github 队列应当以"加入到这个队列的时间"最新排上面

TODO 46.1 （状态：已完成）
issue queue里面的滑动条都不符合docs下说明的滑动条风格，需要修改

- 一句话：根因（html/body scrollbar 属性继承陷阱）已记入 docs/ui-conventions.md。

TODO 46.2 （状态：已完成）
1. 删除「从监听同步」按钮
2. 用户手动搬运 issue 所在队列后，更新 queuedAt 的时间
3. 队列的「添加仓库 Issue/PR」按钮变为直接管理 GitHub 监听：添加仓库自动创建对应监听（只开 Issue+PR）并回扫一次存量入队（自有仓库全量、他人仓库仅 @me）；issue/PR 状态标记全部由监听驱动（close/merge/reopen 只回写 state/merged，不动列）

TODO 47. （状态：已完成）
通知里提示一个issue被关闭时，显示的closer错误，应当显示正确的closer，却显示了author

TODO 48. （状态：已完成）
联系人数据、自定义节日数据改为持久化数据驱动
原读取yml的改为临时按钮导入数据

TODO 49. （状态：已完成）
github集成现在会经常扫描仓库，在设置中加一个自动适应开关（默认开启）如果开启了适应，就会按照需要监听的功能的数量为计量，每多16个数量扫描间隔就延长1分钟。

TODO 50. （状态：已完成）
patch 随笔的文字选择的右键contextmenu
有以下按钮：
1. 剪切 （若可以编辑）
2. 复制
3. 粘贴 （若可以编辑）
4. 全选
5. AI （只在随笔中显示）

- 一句话：外壳与功能分离的规范已记入 docs/ui-conventions.md §7。

TODO 51. （状态：已完成）
新增更多主题颜色：绿色、紫色、橙色等（当前只有亮/暗两套，见设置里主题切换）。

TODO 52. （状态：已完成）
现在个人主页里的4个组件（天气，待办，使用时长，专注钟），都是较少文字量却占据了较大空间，应当只占据需要的空间，不要撑到那么大的大小
另外应该要支持用户可以自己调整这些组件的位置（下面的activity&contributions）

TODO 53. （状态：已完成）
专注钟默认改为正计时，按钮状态切换改为缓慢向下移出画面，然后向上浮出新的按钮

TODO 54. （状态：已完成）
应当在待办事项里加一个自带的关系类，打开按钮加到个人主页那个待办事项的卡片里
然后，关系类的存储应该改一改（包括个人主页和随笔的），在图内的显示范围添加一个新的sidebar，这个sidebar可以显示关系族分类，按不同的类别分别存储不同的图。
默认有一个"我的分类"分类族，默认的节点也都放在这里
然后，添加一个 AI 整理
还要支持可以左键按住选择范围内的节点，可以有右键contextmenu选择，支持除了"添加子节点"的其他4个功能
对于1个或若干的节点，现在有新的"搬迁"选择在contextmenu里，点开后，先列表显示当前有什么分类（或添加，对于当前所处分类暗色表示禁用）然后最底下添加一个"搬迁至其他图"的按钮，点击后可以显示可以搬迁到其他的关系类图（如自带的待办事项关系类图，和随笔里其他的关系类图）然后再打开到这个指定的图的上面的界面里。
对于旧数据，先默认按移动到默认的"我的分类"里处理。

- 一句话：旧数据已迁移（categories[].relation → 顶层 relationFamilies）；期间多轮 xyflow 选中双向同步死循环的修复根因见 2026-10-05 工作日志。

TODO 55. （状态：已完成）
1. 自定义节日编辑：设置 → 账户与同步新增「自定义节日」管理区（列表 + 新建/编辑/删除弹窗，字段：名称/规则/颜色/放假/上班），与「从 yml 导入」并存；保存时用 parseFestivalRule 校验规则格式
2. 日历日期右键交互：右键任意日格弹出菜单（样式与关系类图节点右键一致），红字「今天放假」/蓝字「今天上班」快速标记；实现为往 store.customFestivals 写一条 festival_rule="YYYY-MM-DD" 的一次性节日（复用假/班角标管线），再点同项=取消标记，假/班互斥

补充调整（2026-10-03）：自定义节日管理从设置页移入日历页——日历工具栏右侧新增管理按钮（CalendarCog 图标），弹窗内右上角「添加节日」按钮，新增按名称/规则搜索；设置页仅保留 yml 导入入口（文案已注明节日改在日历页管理）。

TODO 56. （状态：已完成）
1. 通知页面里增加一个搜索框
2. brandheader 里的搜索框改为仅在随笔时出现（其他视图不显示）

TODO 57. （状态：已完成）
更改AI图标，工具栏的改为如下
<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 48 48">
	<path d="M0 0h48v48H0z" fill="none" />
	<ellipse cx="24" cy="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="7.5" ry="20.5" />
	<ellipse cx="24" cy="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="7.5" ry="20.5" transform="rotate(-60 24 24)" />
	<ellipse cx="24" cy="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="20.5" ry="7.5" transform="rotate(-30 24 24)" />
</svg>
其他地方涉及AI按钮的，将按钮文本里的"AI"改为彩色的AI字即可

TODO 58. （状态：已完成）
当我在随笔界面里还没打开任何界面时，也显示"还没有分类"
但实际，在有分类时不应这样显示，而是显示"打开一个分类"等提示信息

TODO 59. （状态：待处理）
AI 整理关系图（从 TODO 54 拆出，本轮不做）：读取图中已有内容和用户提供的素材，生成或补充关系图（写回节点+连线）。功能较大，执行前需主人指明作用域 scope（当前族 / 整个分类 / 跨分类）。

TODO 60. （状态：已完成）
加一个自动备份功能，保留最近5条备份（每天关机时自动保存1次）
当当前数据量与备份数据量相差值超过50%时，弹窗提醒用户可能有数据丢失，需注意备份数据

- 一句话：备份存 IndexedDB（workspace-autobackup），管理入口在设置→账户与同步。

TODO 61. （状态：已完成）
生日横幅
xxx最近生日（） 或 最近有n人生日（xxx，xxx）
这个怎么显示内容需要先设计一下，暂时不确定

TODO 62. (状态：待处理)
最大的问题就是他没有成为整个 Windows 桌面的一部分，工具这些本应是小组件一样的

TODO 63. （状态：已完成）
@ todo 60
- 一句话：与 TODO 60 内容重复，已随 60 一并实现。

TODO 64. （状态：已完成）
todo：增加一个词汇表，有搜索就好了
词汇表结构如下：
词 -> 词的释义解释

然后可以点击一个按钮，输入或选择题数，然后就可以开启一轮问答，问答内容就是屏幕中间贴出这个词汇，然后下面textarea输入这个词的意思。
记录每题分别答题的时间，每题只有最终打完之后才一次性提交给ai（进入评分阶段）
根据词汇表内容和联网搜索，最终ai给出每题作答的评价（错误（不符合词汇表描述），部分正确（部分符合词汇表描述），正确（符合词汇表描述），超越（符合词汇表中描述且给出了更多正确的义项））
反馈到词汇表组件里呈现结果。
作答系统需要好好设计一下
然后添加一个skill可以ai批量添加词汇，方便我把4本英语书内容全放里面去

- 一句话（拍板口径）：IndexedDB 存储 / AI 批量加词两段式 / 出题随机+错词加权 / 位置=工具栏卡片。

TODO 65.（状态：待处理）
@ todo 59
mw 思维导图 AI 重排版 relayout 需要重新设计，这简直是史
scope是指这个ai可以操作的范围（比如能不能访问到外部的关系族，还是只对当前一个树操作，还是在这个族内操作）
然后应该要顺便给一下，这个node实际显示了多大，周围的node占据了什么位置

TODO 66. （状态：已完成）
删除关系族时，如果没有节点，则不用弹窗提醒

TODO 67. （状态：已完成）
设置增加一个标签管理

TODO 68. （状态：已完成）
@ todo 32
todo 32 效果未实现
用户在AI对话栏输入<blue>这是一段文字</blue>并回车后（借AI对话栏自动渲染富文本来看效果），显示的文本为<blue>这是一段文字 后面的</blue>显示上被吞掉，点击复制文字后可以确认原文仍为<blue>这是一段文字</blue>请调查无法渲染的根因

- 一句话：根因（全锚定正则被误用于滑动窗口匹配）已沉淀为回归用例 tests/format-colors.test.ts。

TODO 69. （状态：已完成）
允许关系族之间调整位置

TODO 70. （状态：已完成）
当前docs规范风格的滑动条，会在深色主题颜色下，与背景融为一体，导致无法看到滑动条。
同时，滑动条过长时，在显示屏幕上滑动条的底部会出现白色矩形（这一条尚需多加验证，有时显示有时不显示的）

- 一句话：滑条颜色统一走 --scrollbar-thumb 变量；corner 白块偶发未稳定复现，遇到时再确认。

TODO 71. （状态：已完成）
GitHub 队列四条（2026-10-10 主人口头）：
1. 手动添加单个 Issue/PR
2. 添加监听仓库校验仓库存在（404 不予添加）
3. 设置里添加监听仓库支持完整链接
4. 队列搜索框占位符过长溢出，简短

TODO 72. （状态：已完成）
1. code block 行号标识可能不会正确对应到正确的行号上（如果一行内容过多挤压到下一行的情况下，会导致下一行行号标识偏移）
2. 在code block右上角语言标识处添加一个点击复制按钮。

TODO 73. （状态：已完成）
1. 在词汇表里，当用户添加一个词且这个词已经存在时，在用户输入完词条名后就在词条名的下面添加一个提示显示已经存在并在旁边加一个切换按钮，引导用户直接加载已有内容再进行编辑。
2. 问答界面需要再改善，改成下面有题号选择点击可以切换到对应题，上面也有左右符号可以点击上一题下一题。
题目在作答完毕后一次性提交，不用设置单独每题的提交。（提交作答的按钮放在题号选择的下面）
题号选择呢就是没写的题显示蓝色背景圆，写了的题显示绿色背景圆。
3. 一次问答最多100题

TODO 74. （状态：已完成，待目视确认）
加一个 ai 会话标题生成的，就调用当前的ai生成标题。
默认先就现在的截断，然后ai回复完之后再静默让ai生成一个标题。（要求不超过10个字且没有句号结尾，如果ai给的过长就还是自动截断就行）

TODO 75. （状态：已完成）
将全部界面的背景图都改为 refs/polar-light.txt 那样的游动极光背景（包括所有workspace的背景界面，关系图的背景界面）

- 一句话：调参常量在 aurora-background.tsx 顶部与 app/page.tsx 的 AURORA_GLASS。

TODO 76. （状态：待处理）
关系类图的渲染又需要好好大修一下
首先是改成星图的形式，只需要一个点和标题来表示一个内容，而不必现在全部都显示出来
星图默认极缓慢的绕着根节点均匀旋转（类似鱼群）可以在图里开启/暂停旋转
当点击左键一个节点后，改为展开并放大一定大小与屏幕剩余空间大概相配
再点击一次这个展开状态的节点，可以打开节点详情
然后esc可以依次关闭并保存节点详情和退出展开状态
点的颜色直接沿用节点的设置颜色即可。

TODO 77. （状态：已完成）
设置 - AI助手 里技能启停增加一个搜索框

TODO 78. （状态：已完成）
在设置 - AI助手里AI头像下有个"仅本机明文存储于 localStorage，请不要在共享环境使用。"是什么鬼，这不应该是放到千帆API KEY下的说明吗

TODO 79. （状态：已完成）
在设置 - 通用中，启动行为里添加上所有的workspace view

TODO 80. （状态：已完成，待目视确认）
在联系人 - 联系人编辑界面 - 添加联系方式里，在深色模式下，联系方式选择的dropdown会完全变白，啥也看不到，需要修复

- 一句话：根因是全局未声明 `color-scheme` 且未给 option 显式着色，Chromium 按浅色渲染原生 select 弹窗（白底+近白文字）。修法：`app/globals.css` 的 `:root` / `.dark` 声明 `color-scheme`，并加 `select option { background-color: var(--muted); color: var(--foreground); }` 按主人要求统一灰底（浅色主题浅灰底、深色主题深灰底）；生日类型 select 同款 bug 一并覆盖；规则已沉淀至 docs/ui-conventions.md 第 9 节。
- 第二轮（2026-10-25 主人实测反馈）：仅 color-scheme 不够，Chromium 弹窗不完全遵循，补 option 显式着色；主人要求「显示成灰底」。

TODO 81. （状态：已完成）
deploy.yml 在 Build 步骤前加 `npm run lint && npm test`（来自 maintainability-review.md 缺口 #1/#6）——当前 lint 和 76 条测试都不在部署门禁上，坏代码只要类型过关就能带着 lint 错误和挂掉的测试上线，i18n en/zh 同构测试也只在本地域内生效

TODO 82. （状态：已完成）
依赖漏洞治理（来自 maintainability-review.md，当前 npm audit 11 条漏洞：2 critical / 5 high，`next` 本体 advisory 在构建与客户端运行时路径上不可忽略）：
1. 启用 Dependabot alerts（仓库设置一键）或 CI 加 `npm audit --audit-level=high`
2. 跑一次 `npm audit fix` 后回归测试，处理掉 markdown-it / postcss / modelcontextprotocol-sdk 一批
3. 评估 `next` critical advisory 的升级

- 逐项落实情况（2026-10-25 核实）：① `.github/dependabot.yml` 已配置（npm + github-actions 周更、dev 依赖分组、tiptap/ai-sdk 分组、忽略 next/react/react-dom semver-major）；本轮给 `.github/workflows/ci.yml` 补上 `npm audit --audit-level=high` 门禁步骤（跑在 npm ci 后，审计实际安装树，high/critical 即失败）。「Dependabot alerts」为仓库设置项，需主人在 GitHub 仓库 Settings → Code security 一键开启，代码侧已就绪。
  ② 已随先前依赖更新完成：当前 `npm audit` 0 漏洞（review 记录的 11 条已清，next 16.4.2）。
  ③ 已消解：next 16.4.2 不在 advisory 区间（9.3.4-canary.0 – 16.4.0）内，无需升级动作。

TODO 83. （状态：已完成）
给「persist merge 迁移」配回归测试（来自 maintainability-review.md）：构造 v-1 存档 JSON，断言 `merge` 迁移结果——把 AGENTS.md 红线 #1「新增字段必须过 merge」从文字约定变成机械检查，typecheck 挡不住「忘了写 merge 兼容」

- 一句话：merge 逻辑从 `lib/store.ts` 整块抽为纯模块 `lib/persist-merge.ts`（`mergePersistedState` 导出，测试不再需要 import store）；`tests/persist-merge.test.ts` 用 v-1 存档断言 6 组迁移行为（persona 升级 / 通知字段回填 / 排序 / 生日横幅 / dayStartOffset 夹取 / 关系族 schema 迁移），并验证新字段直通不被吞。

TODO 84. （状态：已完成）
补 `no-floating-promises` / `no-misused-promises` 两条 type-aware lint 规则（来自 maintainability-review.md 缺口 #3）：当前 eslint 仅 next 预设，漏 `await` 的 detached promise 在严格 TS 下仍静默

- 一句话：eslint.config.mjs 对 `**/*.ts{,x}` 开 `projectService` + 两条规则（不开 recommended-type-checked 全集，避免 no-unsafe-* 家族大面积重写）；tests/ 目录 override 关 floating（node:test 的 describe/it/test 返回 Promise 属 runner 协议）；存量 187 条（159 floating + 28 misused）全部修掉——floating 补 `void` 标记，misused 的 async 处理器包一层 `() => void fn()`，settings 两处 onChange async 抽为共用 `handleAvatarFile`。

TODO 85. （状态：第一刀已完成；第二刀 settings-view、第三刀 组件重复猎捕待处理）
大文件拆分计划（来自 maintainability-review.md，当前 17/149 文件超 500 行）：
1. 第一刀：`lib/store.ts`（2239 行）按领域切片（calendar / ai / vault / relations）— 已完成
   - store.ts 2239→381 行（退化为组合层）；拆出 12 个领域切片 + shared.ts 共 13 个模块（合计 2268 行）：
     calendar / settings / ui / categories / ai / contacts / relations / notifications / contributions / issue-queue / tags / backup 切片 + shared 共享工具。
   - 切片模式：slice `export const createXSlice = (set, get) => ({...})`，主文件 `(set,get)=>({...createXSlice(set,get), ...})` 组合。
   - 验收：typecheck 0 错误 / lint 0 错误 0 警告 / test 116/116 全绿。
   - 坑：store.ts 的相对 import 解析基址是 `lib/`（非 `lib/store/`），切片 import 用 `./store/...` 才解析得到；Python 改写文件须 `newline="\n"` 否则 Windows 下被转 CRLF 触发 383 个 linebreak-style 错误。
2. 第二刀：`components/settings-view.tsx`（1899 行）按设置分区拆 — 已完成
   - settings-view.tsx 1899→77 行（仅留 SETTINGS_SECTIONS 导航 + 分区条件渲染）；
   - 拆出 `components/settings/` 11 个文件（合计 2017 行，均 <500）：general（237）/ shortcuts（116）/ account（122，含 DataSectionContent 组合）/ data（472，备份导入导出 + 清空 + 3 弹窗）/ ai（169）/ advanced（123）/ notifications（278）/ news（42）分区组件 + shared（66，Section + useAvatarUpload）/ tag-manager-block（233）/ auto-backup-manager（159）独立块。
   - 行为保持点：wipe 弹窗「先导出」复用 data-section 内的 onExport（exportSel 状态同源）；账户/AI 头像上传共用 shared 的 useAvatarUpload；通知日志导出工具随 advanced-section 迁移。
   - 验收：typecheck 0 错 / lint 0 错 0 警 / test 116/116 全绿。
3. 动手前先跑一轮针对 components/ 的重复猎捕（多个 *-workspace.tsx 疑有相似的骨架模式，待验证）— 待处理

TODO 86. （状态：已完成）
写一份 docs/HANDOFF.md（来自 maintainability-review.md，连续性措施）：发布流程、`update-dependencies` 脚本的存在与用法、localStorage schema 迁移惯例——给未来接手者（包括未来的 LLM 代理）

- 一句话：docs/HANDOFF.md 四节——① 三条发布通道（Pages/Release zip/本地 serve）+ 门禁 + 构建特性（静态导出不兼容 next start、依赖数据构建期打包、wrangler 预留）+ 版本号/tag 约定；② update-dependencies 脚本（DEPS 清单扩展法、SKIP_DEP_UPDATE、失败非致命）；③ localStorage schema 迁移惯例（persist-merge.ts 单点迁移 + 测试回归 + persist/备份双路径 + 手测验收法）；④ 接手 checklist。全篇以文件名/方法名互链，不写行号。

TODO 87. （状态：已完成）
添加 GitHub Release workflow

- 一句话：`.github/workflows/release.yml`——tag push（`v*`）或手动触发，构建本地可用版（不带 basePath）打包 zip，经 softprops/action-gh-release 创建 Release 并附产物 + 自动 release notes。

TODO 88. （状态：已完成）
通知页面里加一个，和 github contribution 一样的，折叠过多消息。
默认打开只显示100条消息，可以点击展开按钮继续查看。

- 一句话：notifications-workspace.tsx 新增 visibleCount=100 折叠 + 「展开更多（剩余 N 条）」按钮（每次 +100），搜索/来源切换时重置回 100；未读标记逻辑不变。

TODO 89. （状态：已完成）
通知改成放到brand header里的用户头像的左边，功能不变

- 一句话：通知铃铛+未读徽标从 toolbar-panel.tsx 底部导航移除，移到 brand-header.tsx 头像左侧；点击 goNotifications 进入通知页（store 内标记已读逻辑不变）。

TODO 90. （状态：已完成）
npm run lint / test 里的问题逐一处理，同时加到现有的 ai agent workbuddy check 流程那里

- 一句话：实测 lint 0 错误 / test 116/116（存量问题已在此前 todo 中清掉，TODO 84 再把 187 条 promise 类存量清零）；「check 流程」已由 AGENTS.md 第 2 节「验收（AI 侧）」+ 红线 #3 固化（每次改动必跑 typecheck+lint+test），CI 侧 ci.yml / deploy.yml 均已挂 lint+test。若主人所指为 IDE 侧其他机制，待明确后补充。
