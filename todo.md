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

TODO 17. （状态：待处理）
给ai对话框两边内容添加文字朗读功能？（不过现在还没找到合适的api，先搁置）

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

TODO 28. （状态：待处理）
增加一些内链访问。。。自动跳转到某个AI对话、思维导图节点等

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
文档规范整改已完成：新增 `docs/data-storage.md`（持久化字段总表，按存储后端划分，含数据链路/See also/Notice）；移除所有行数标记（`ui-conventions.md`/`remote-image-cache-design.md`）；`entry-points.md` 内嵌长括号解释拆为「字段说明」表并补数据链路/See also/Notice（§8.1/§8.8/§8.10/§8.13）；修正陈旧引用（`settings-dialog`→`settings-view`、日历纯月视图、备份为 ZIP）；精简 `lib/image-store.ts` 头注释。
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

TODO 40. （状态：待处理）
多语言支持，找找有没有现成库吧

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
修复：通知卡片头行的可截断 span（仓库 / 摘要 / 精选数）缺 min-w-0，flex 子项 min-width:auto 使 truncate 失效、长文字撑破卡片；已补 min-w-0。
补充（2026-10-03）：4 处类型徽标补 shrink-0 防挤压换行。
通知页面里的卡片里的单行文字过长会超出框，需要加截断

TODO 46. （状态：已完成）
github 队列应当以"加入到这个队列的时间"最新排上面

TODO 46.1 （状态：已完成）
2026-10-03 静态核实：queue 两处滚动容器（L171 看板 / L182 列内）均已挂 native-scroll，并把这两处补进了 docs/ui-conventions.md 正例清单；根因（主人 DevTools 截图坐实）：html/body 的 scrollbar-width/color 是继承属性，继承到所有后代后同样触发 Chrome 121+ 陷阱，全站 ::-webkit-scrollbar 胶囊被禁用、退化系统细条；平时看到的胶囊多为 Base UI ScrollArea 自绘。修复：globals.css 内容容器组（.native-scroll/textarea/pre/table）显式重置标准属性切断继承，Firefox 经 @-moz-document 回落 thin+主题色；顺带补 queue 列内容器缺的 min-h-0；docs 继承陷阱已补记。
issue queue里面的滑动条都不符合docs下说明的滑动条风格，需要修改

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
- 已改（2026-10-03）：外壳与功能分离（主人要求，记入 docs/ui-conventions.md §7）——功能层 lib/text-menu-actions.ts（TextMenuContext 能力接口 + BUILTIN_TEXT_MENU_ACTIONS：剪切/复制/粘贴/全选/AI），外壳层 components/text-context-menu.tsx（base-ui 渲染，按能力过滤、AI 项前自动分隔）。RichTextEditor 两个分支（TipTap 可视化 / 源码 textarea）均接入；「AI」项仅在传入 onAiText 时出现，随笔 novel-workspace 传入（选中内容经 askAiAbout 新建会话分析）。富文本复制抽为 richtext/clipboard.ts copySelectionRich，浮动工具条与右键共用。剪切/粘贴仅在可编辑宿主出现（只读文档天然只有复制/全选）。待主人目视确认菜单样式与各操作实际效果。

TODO 51. （状态：已完成）
实现（2026-10-03 改版，主人反馈要的是主题不是主题色）：ThemePreference 扩展为 light/dark/system/green/purple/orange，设置里「主题」下拉直接多出绿色/紫色/橙色三项；彩色主题是一套固定配色（浅色基调+主题色强调，不分亮暗），next-themes attribute=class 挂成 html.green 等类，globals.css 提供 html.green/purple/orange 三套完整变量；原 settings.themeColor 独立维度已整体移除（types/store/provider/设置 UI/CSS 清零）。
新增更多主题颜色：绿色、紫色、橙色等（当前只有亮/暗两套，见设置里主题切换）。

TODO 52. （状态：已完成）
现在个人主页里的4个组件（天气，待办，使用时长，专注钟），都是较少文字量却占据了较大空间，应当只占据需要的空间，不要撑到那么大的大小
另外应该要支持用户可以自己调整这些组件的位置（下面的activity&contributions）
- 已改：小组件区由 sm:grid-cols-2 等宽两列改为 flex-wrap + 内容自适应宽度（专注钟定宽 w-64 保证按钮排布，其余 w-fit）；四卡支持拖拽调序（HTML5 DnD，拖法与 sidebar 分类一致：落点左半插前/右半插后），顺序持久化到 settings.profileWidgetOrder（types.ts 新增 ProfileWidgetId + normalizeProfileWidgetOrder 兜底，store merge 接入）。拖拽手感与视觉效果待主人目视确认。

TODO 53. （状态：已完成）
专注钟默认改为正计时，按钮状态切换改为缓慢向下移出画面，然后向上浮出新的按钮
- 已改（2026-10-03，此条目上一轮的状态更新被覆盖丢失，现补回）：focusMode 默认 "down"→"up"；控制按钮组状态切换加双向动画——旧按钮 500ms 下移+淡出（fill-mode-forwards 锁终态、退场期禁点击），新按钮 500ms 自下向上浮入。动画效果待主人目视确认。

TODO 54. （状态：已完成）
应当在待办事项里加一个自带的关系类，打开按钮加到个人主页那个待办事项的卡片里
然后，关系类的存储应该改一改（包括个人主页和随笔的），在图内的显示范围添加一个新的sidebar，这个sidebar可以显示关系族分类，按不同的类别分别存储不同的图。
默认有一个"我的分类"分类族，默认的节点也都放在这里
然后，添加一个 AI 整理
还要支持可以左键按住选择范围内的节点，可以有右键contextmenu选择，支持除了"添加子节点"的其他4个功能
对于1个或若干的节点，现在有新的"搬迁"选择在contextmenu里，点开后，先列表显示当前有什么分类（或添加，对于当前所处分类暗色表示禁用）然后最底下添加一个"搬迁至其他图"的按钮，点击后可以显示可以搬迁到其他的关系类图（如自带的待办事项关系类图，和随笔里其他的关系类图）然后再打开到这个指定的图的上面的界面里。
对于旧数据，先默认按移动到默认的"我的分类"里处理。

### TODO 54 实施记录（2026-10-05，方案 B：族外置顶层）
- 数据结构：`lib/types.ts` 新增 `RelationFamily`（id/name/categoryId/nodes/edges/view/viewport），删除 `Category.relation` 与 `RelationContent`；store 顶层新增 `relationFamilies`（key=族 id）与 `pendingFamilyId`（跨组件跳族标记，刷新置空不持久化生效），顶层 `mindmapViewports` 废弃。
- 旧数据迁移：`lib/store.ts` 的 `migrateRelationState`（persist merge / importData 替换 / mergeData 合并三处共用）——旧 `categories[].relation` 迁为每分类一个默认族「我的分类」（id 稳定 `fam_${catId}`，viewport 取 `mindmapViewports[catId]` 后整体废弃）；坏值兜底（nodes/edges 非 Array 归空、view 非法回落 mindmap、族缺 id/categoryId 丢弃、孤儿族丢弃）；每个 relation 分类保底一个族；内建「待办事项」relation 分类（id `todo-relations`，builtin）缺失自动补建含默认族；备份「随笔数据」分区现随带 `relationFamilies`，旧备份导入同样走迁移。
- actions 全量改族定位：addNode/addChildNode/updateNode/removeNode/setNodeSolution/connectNodes/removeEdge/removeSub/setFamilyView/setFamilyViewport；新增 addRelationFamily / renameRelationFamily / deleteRelationFamily（清理族内节点贡献）/ moveNodesToFamily（只搬节点 + 两端都在搬移集合内的边）/ setPendingFamilyId；removeCategory 连带删族清账；扫描/搜索/标签/截止/图片引用（lib/search、tags、deadlines、image-refs、builtin-skills 的 wb_get_mindmap_graph / wb_get_mindmap_node 增 familyId/familyName 参数）全部改读族。
- 图内族 sidebar（FamilySidebar）：列族/切换/行内新建与重命名/删除（AlertDialog 确认）；底部「AI 分析」（askAiAbout 携带族上下文，AI 用既有只读技能出报告）与「整理布局」（lib/ai/relayout.ts 函数式一次性调用，经 request-queue 并发纪律：强制同步时让位对话队列、多次调用串行；prompt 给节点清单要求返回 JSON {nodeId:{x,y}}，解析容错支持代码围栏与前后缀说明文字，逐坐标校验有限数值才写回，失败 toast 不落库）。
- 多选与搬迁：React Flow 默认 Shift+左键框选（onSelectionChange 收集 selectedIds）；多选右键隐藏「添加子节点」，标记完成（选内有未完成则全标记完成）/添加标签/节点风格/截止日期批量套用；「搬迁」弹窗 MoveNodesDialog——上半区当前分类各族（当前族暗色禁用、可就地新建族），底部「搬迁至其他图」列其他 relation 分类的族；跨分类搬迁后 setActiveCategory + setPendingFamilyId 直达目标族。画布切族整体重挂（key=family.id）重放各族视口存档。
- Profile 待办卡新增「打开关系图」按钮 → 跳转内建「待办事项」分类。
- typecheck / lint 均 0 错误（仅 vault 一条历史 warning）；`.relation` 残留仅剩迁移代码与注释。以上均待主人目视确认（族 sidebar 交互、多选批量、搬迁跳转、AI 分析/整理布局效果）。
- 修复（2026-10-05 主人实测报错「Maximum update depth exceeded」）：根因是 xyflow v12 `SelectionListenerInner` 把 `onSelectionChange` prop 放进 effect 依赖，内联箭头函数每次渲染新引用 → effect 每次渲染重跑 → setState(新 Set) → 再渲染死循环。改为 `useCallback` 稳定引用 + 内容相同返回旧 Set（React 跳过重渲染）双保险。
- 修复（2026-10-05 主人实测多选右键弹浏览器原生菜单）：根因是 xyflow v12 多选时渲染盖在节点上层的选区矩形 `.react-flow__nodesselection-rect`（z-index:3 + pointer-events:all），其 onContextMenu 未 preventDefault 也不转发到节点。关闭其 pointer-events 让事件穿透回节点卡片（base-ui 批量菜单照常触发）；拖整组不受影响（xyflow 拖任一选中节点即带动全组，getDragItems 收集全部 selected）。
- 修复补充（同日，上轮 Tailwind 任意变体实测无效）：Tailwind v4 utilities 全部在 cascade layer 里，xyflow 的 style.css 未分层——按 CSS cascade 规则**未分层样式压过任何 layer，specificity 无效**，故 `[&_.react-flow__nodesselection-rect]:pointer-events-none` 类虽生成但不生效。改为 app/globals.css 末尾写未分层普通 CSS（`.react-flow .react-flow__nodesselection-rect { pointer-events: none }`，specificity 0,2,0 胜 0,1,0），组件内无效类已删。
- 修复（2026-10-05 主人实测右键选区内不同节点「搬迁 n 个节点」数量不一致）：rfNode 渲染缓存命中条件漏了 multiCount——它是 data 里的闭包快照（菜单数量显示源），选区数量变化时已选中节点 multi 布尔不变→缓存命中→data 不重建→显示过期旧数量（新进选区节点则重建显示新数量）。已把 multiCount 纳入缓存 key。行为层 handleMenuAction 实时读 selectedIds 本就正确，纯显示过期。
- 死循环修复续（2026-10-05 深夜，主人实测 onSelectionChange 修复后仍复现一次、措辞变为 render-phase 变体）：确定缺陷——store `setFamilyViewport` 无条件造新 viewport/family 对象（值相同也写 store），配合 onMoveEnd（内联箭头 + xyflow panZoom end/fitView 可重复触发）构成「视口事件→写 store→重渲染」回流燃料。修复：store 侧加值等守卫（x/y/zoom 相同直接不写）；组件侧 onMoveEnd useCallback + 数值级比较双重拦截；onConnectStart/onConnectEnd/onPaneContextMenu/onEdgeClick 全部 useCallback 化（xyflow StoreUpdater 把每个 prop 放进独立 effect，内联箭头让 store 每渲染 setState 一轮）。
- 死循环修复终（2026-10-05 下午，主人实测点击节点仍触发，useEffect 变体）：**结构性根治**——三次死循环的共同根源是 selected 双向同步：快照按 `activeItemId || selectedIds` 派生 selected 推给 React Flow，RF 的用户选择又经 onSelectionChange 回写 selectedIds，两条流失步即振荡（点击/框选/视口只是不同发作方式）。重构为单向：①React Flow 内部选中是唯一真相，rfNodes 快照的 selected 改读本地画布态现值（localSelected map，useNodesState 上移初值空数组由 sync 首帧推入）；②sync effect 守卫去掉 selected 比较、重建时 `selected: n.selected`（**永不反向写选中**）；③activeItemId 改由专门 effect「只补选不清除」编程写入一次（保住添加子节点/列表跳转高亮，不破坏多选；点击路径 RF 自己已选中故 no-op）。typecheck/lint 均 0 错误。

TODO 55. （状态：已完成）
1. 自定义节日编辑：设置 → 账户与同步新增「自定义节日」管理区（列表 + 新建/编辑/删除弹窗，字段：名称/规则/颜色/放假/上班），与「从 yml 导入」并存；保存时用 parseFestivalRule 校验规则格式
2. 日历日期右键交互：右键任意日格弹出菜单（样式与关系类图节点右键一致），红字「今天放假」/蓝字「今天上班」快速标记；实现为往 store.customFestivals 写一条 festival_rule="YYYY-MM-DD" 的一次性节日（复用假/班角标管线），再点同项=取消标记，假/班互斥

TODO 55 补充调整（2026-10-03）：自定义节日管理从设置页移入日历页——日历工具栏右侧新增管理按钮（CalendarCog 图标），弹窗内右上角「添加节日」按钮，新增按名称/规则搜索；设置页仅保留 yml 导入入口（文案已注明节日改在日历页管理）。

TODO 56. （状态：已完成）
实现：通知页 sender 筛选行下新增搜索框（匹配标题/摘要/仓库/来源名，与筛选叠加，空结果有专属提示）；brandheader 搜索框改为仅 view==="workspace"（随笔）时渲染。
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

### TODO 57/58 实施记录（2026-10-04）
- 57：新建 components/ai-brand.tsx（AiIcon 原子图标 = 主人指定 SVG，签名兼容 lucide；AiText 渐变彩色「AI」字 violet→fuchsia→sky）。工具栏「AI 对话」图标 BotMessageSquare→AiIcon、文本 AI 彩色；profile「问 AI 今日待办」、右键菜单 AI 项文本同步彩色。彩色渐变色值如需调整改 AiText 一处即可。
- 58：page.tsx 主区空态按 categories.length 分支——有分类未打开显示「打开一个分类」，无分类保持「还没有分类」引导创建。
- 均待主人目视确认（图标观感 / 渐变配色 / 空态文案）。

TODO 59. （状态：待处理）
AI 整理关系图（从 TODO 54 拆出，本轮不做）：读取图中已有内容和用户提供的素材，生成或补充关系图（写回节点+连线）。功能较大，执行前需主人指明作用域 scope（当前族 / 整个分类 / 跨分类）。

TODO 60. （状态：已完成）
加一个自动备份功能，保留最近5条备份（每天关机时自动保存1次）
当当前数据量与备份数据量相差值超过50%时，弹窗提醒用户可能有数据丢失，需注意备份数据

- 已实现（2026-10-05，@TODO 63 与本条重复，63 一并关闭）：新建 `lib/auto-backup.ts`——备份存 IndexedDB（库名 workspace-autobackup，备份可能超 localStorage 限额），快照 = exportData 全分区（除保险库——加密数据独立存储），key=dayKey（沿用 settings.dayStartOffset 的 04:00 翻篇口径，同一天只留一份），滚动保留最近 5 份。
- 关机时机：`AutoBackupWatcher`（挂 page.tsx 全局）监听 visibilitychange→hidden 与 beforeunload 双路径，lib 内当天去重防重复写。
- 差异提醒：启动 3s 后比较当前快照与最新备份的数据量（JSON 字符长度，备份大小为基数），相差超 50% 弹 AlertDialog（双向报：骤减=可能丢数据、骤增=可能误导入），每次启动最多一次。
- 管理入口：设置 → 账户与同步 → 「自动备份」块——备份列表（时间/大小）、立即备份、恢复（AlertDialog 确认，替换导入，走 importData 含旧数据迁移）、删除。图片不随快照携带（仍在本地图片库）。
- typecheck / lint 均 0 错误。待主人目视确认（设置页区块、提醒弹窗样式）。

TODO 61. （状态：已完成，待目视确认）
生日横幅
xxx最近生日（） 或 最近有n人生日（xxx，xxx）
这个怎么显示内容需要先设计一下，暂时不确定

- 已实现（2026-10-06，验收口径经主人确认：brandHeader 内 / 前 7 天可配置 / 自己生日纳入）：
  - `lib/birthday.ts` 新增 `nextBirthdayIn(person, today)`（下一个生日日期 + 剩余天数；公历 2/29 非闰年回落 2/28 防止 Date 溢出进位到 3 月；农历经 solarMatchForLunarMD 换算，当年已过自动回落次年）与 `upcomingBirthdays(people, daysAhead, today)`（窗口内汇总，按剩余天数升序、同天按姓名）。
  - 数据源：store.contacts（Person.birthday，公历 / L 前缀农历）+ 设置→账户的用户生日（作为伪联系人 `__self__` 纳入，名字取 settings.userName）。
  - 横幅 UI：`components/brand-header.tsx` 中间段 BirthdayBanner（桌面端 md:flex 显示、移动端隐藏；无临近生日时不占位）。文案按主人原文形态：单人「xxx 最近生日（M月D日，还有 n 天 · 农历）」、多人「最近有 n 人生日（xxx、xxx 等 n 人）」（取前 3 个名字）；当天过生日 → 横幅高亮 primary 色 + ✨ + Cake 图标脉冲，hover 显示每人明细，点击跳转联系人页。
  - 配置：Settings 新增 `birthdayBannerDays`（默认 7，0 = 仅当天，上限 60，`normalizeBirthdayBannerDays` 兜底接入 persist merge 与 importData 两处 settings 组装）；设置 → 通用/基础 新增「生日横幅提前天数」数字输入。
  - 测试：新增 `tests/birthday.test.ts`（11 用例：公历倒推 / 当天 / 已过归明年 / 2/29 闰年两态 / 农历动态构造换算日 / 汇总排序与窗口过滤），全套 28 用例通过。
- typecheck / lint / test 均 0 错误。待主人目视确认（横幅出现时机、文案、当天高亮、点击跳转、设置项生效）。

TODO 62. (状态：待处理)
最大的问题就是他没有成为整个桌面的一部分，工具这些本应是小组件一样的

TODO 63. （状态：已完成）
@ todo 60

- 与 TODO 60 内容重复，已随 TODO 60 一并实现（2026-10-05），实现记录见 TODO 60。

TODO 64. （状态：已完成，待目视确认）
todo：增加一个词汇表，有搜索就好了
词汇表结构如下：
词 -> 词的释义解释

### TODO 64 规划与实施记录（2026-10-07，主人已拍板：IndexedDB 存储 / AI 批量加词方案 A（两段式）/ 出题=随机+错词加权 / 位置=工具栏卡片）

**已确认口径补充**：source 独立小系统（不与标签共用）——底层 id 引用、name 随意改、dropdown 快捷写入 + 独立管理界面（删除来源仅摘标记，词条保留）；词汇底层 id 表示、显示层随意增删改；每轮 quiz result 全量持久化（不设轮数上限）。

**批 1（已完成，2026-10-07）**：
- 数据模型（lib/types.ts）：VocabRating 四档（wrong/partial/correct/beyond，VOCAB_RATING_META 四色徽标）/ VocabSource / VocabEntry（review: total/lastRating/lastAt/wrongCount）/ VocabQuizRecord（含答题时释义快照）/ VocabImportItem；BackupSectionId 加 "vocabulary"；VIEW_LABEL 加词汇表。
- 存储层（lib/vocab-store.ts）：IndexedDB workspace-vocab 三 store（entries/sources/records），模块级内存缓存 + 写穿；API：loadVocab / ensureVocabSource（按名幂等）/ renameVocabSource / deleteVocabSource（摘标记回写受影响词条）/ isVocabWordTaken / upsertVocabEntry / removeVocabEntry / addVocabEntries（word trim+忽略大小写去重，跳过保留旧释义；source 按名取建）/ saveQuizResult（记录持久化 + review 回写）/ parseVocabImport（纯函数，导出解析）/ exportVocab / importVocab（replace 整库覆盖；merge 按 id+word O(n) 去重、孤儿 sourceId 置空）。
- 视图接线：store view 加 "vocabulary" + goVocabulary；toolbar-panel TOOL_CARDS 加「词汇表」（BookOpen）；page.tsx 分发 VocabularyWorkspace。
- 词汇工作区（components/vocabulary-workspace.tsx）：顶栏（词数/来源数/轮数统计 + 来源管理 + AI 批量导入 + 添加词条）→ 搜索（拼音搜 word+definition）+ 来源筛选（全部/未分类/各来源）→ 列表（词+来源徽标+最近评价四色徽标+练过次数+释义截断，渲染上限 200 条提示总数）；词条编辑弹窗（word 重名拦截 + source Select 选择 + 新来源名快捷写入输入框）；来源管理弹窗（列表/添加/行内重命名/删除确认含受影响词条数）；批量导入弹窗（粘贴 JSON → parseVocabImport 解析 → 有效/无效/重复统计 + 前 3 词预览 → 确认入库）。
- 备份分区（lib/backup.ts）：exportBackupZip 打包 vocab.json（exportVocab）；importBackupZip 恢复（replace/merge 双模式）；BACKUP_SECTION_META 加「词汇表」（非敏感默认勾选，导出弹窗自动出现）。
- 测试：tests/vocab-store.test.ts（parseVocabImport 6 用例：纯数组/items 包裹/invalid 计数/trim/非法输入/带围栏文本拒绝）。
- typecheck / lint / test 全绿（34 用例）。待主人目视确认。

**批 2（已完成，2026-10-07）**：
- 问答状态机（components/vocabulary-workspace.tsx）：顶栏「开始问答」→ 配置弹窗（范围 Select 默认当前筛选 + 题数 Input，显示范围内词数）→ 作答视图（词居中大字 font-serif text-4xl + 每秒实时计时 + textarea + 提交本题/结束本轮）→ 评分中（逐题串行评分防打爆 API，行内 Loader2 进度）→ 报告（每题四档徽标 + 用时 + 你的作答 + AI 点评；评分分布统计；全部成功自动存档 saveQuizResult，有失败题可行内重试、返回时保存成功题）→ 再来一轮/返回列表。中途退出 AlertDialog 确认（作答不保存）。
- AI 评分（lib/ai/vocab-grader.ts，仿 relayout 模式）：requestDirectCompletion 函数式调用（request-queue 并发纪律）；评分前程序化预搜——复用 wb_web_search 同款本机代理（/api/ai-search + settings.baiduAiSearchApiKey），失败不阻塞评分；SYSTEM_PROMPT 四档标准（wrong/partial/correct/beyond）+ extractJsonObject 容错（代码围栏兼容）+ rating 白名单校验；作答截断 2000 字符。
- 出题抽样（lib/vocab-quiz.ts 纯函数）：pickQuizEntries 加权不重复抽样，权重 = 1 + wrongCount × 2（错词更常出现，主人拍板口径），rand 注入可测。
- wb_prepare_vocab_import 内置技能（lib/ai/builtin-skills.ts）：只读回传导入 JSON 规范（format/rules/example，单次 ≤50 条、不编造、中文释义）；request-queue.ts SYSTEM_BASE 加一句引导（用户要批量整理词汇时先调此技能）。
- 词长限制（主人 2026-10-07 口径）：VOCAB_WORD_MAX = 100（vocab-store.ts 导出）——编辑弹窗 Input maxLength=100 + placeholder 提示；parseVocabImport / addVocabEntries 超 100 计 invalid。
- 测试：tests/vocab-quiz.test.ts（3 用例：数量截断/不重复/错词加权统计性）+ vocab-store.test.ts 补词长上限用例；全套 38 用例通过。
- typecheck / lint / test 全绿。答题/报告界面与 AI 评分效果待主人目视确认（评分需已配置模型；预搜需已配置百度千帆 Key，未配置时仅按词库释义评分）。

**批 1 修正（2026-10-07，主人目视反馈两处）**：
- 词汇列表横长占满屏 → 列表（含空态文案）包进 `max-w-[440px]` 容器，右缘对齐筛选框右缘（搜索框 max-w-72 288px + gap-2 8px + 来源下拉 w-36 144px）。
- 来源下拉选中后显示分类 id → 根因：本项目 Select 是 base-ui 封装，`SelectValue` 不传 children 时渲染**原始 value**（id），项目其他下拉均手写标签兜底、词汇工作区两处漏了。修复：来源筛选下拉与词条编辑弹窗的来源下拉均改为 `<SelectValue>{按 id 查名}</SelectValue>`（未知 id 回落「全部来源」/「未分类」）。
- typecheck / lint / test 均 0 错误。宽度对齐效果待主人目视确认。

然后可以点击一个按钮，输入或选择题数，然后就可以开启一轮问答，问答内容就是屏幕中间贴出这个词汇，然后下面textarea输入这个词的意思。
记录每题分别答题的时间，每题只有最终打完之后才一次性提交给ai（进入评分阶段）
根据词汇表内容和联网搜索，最终ai给出每题作答的评价（错误（不符合词汇表描述），部分正确（部分符合词汇表描述），正确（符合词汇表描述），超越（符合词汇表中描述且给出了更多正确的义项））
反馈到词汇表组件里呈现结果。
作答系统需要好好设计一下
然后添加一个skill可以ai批量添加词汇，方便我把4本英语书内容全放里面去

TODO 65.（状态：待处理）
@ todo 59
mw 思维导图 AI 重排版 relayout 需要重新设计，这简直是史
scope是指这个ai可以操作的范围（比如能不能访问到外部的关系族，还是只对当前一个树操作，还是在这个族内操作）
然后应该要顺便给一下，这个node实际显示了多大，周围的node占据了什么位置

TODO 66. （状态：已完成）
删除关系族时，如果没有节点，则不用弹窗提醒

- 已改（2026-10-05）：FamilySidebar 删除按钮——族内 nodes 为空时直接调 deleteRelationFamily 并 toast「已删除关系族」，不再弹 AlertDialog 确认；非空族维持原确认弹窗（因删除会连带节点、连线与贡献记录）。待主人目视确认。

TODO 67. （状态：已完成）
设置增加一个标签管理

- 已实现（2026-10-05，验收口径经主人确认：重命名+删除+创建；联系人 roles 纳入；放「通用」分区）：
  - store 新增 `renameTag(from, to)` / `deleteTag(name)`——全站遍历四个数据域（随笔章节 tags / 关系族节点 tags / 联系人 roles / 全局标签库 knownTags），「先算后写」模式（set 外算新值与计数，无变更不触发 set，引用级不变性保持）；重命名撞已有标签名时替换后去重即自然合并；返回使用处计数供 UI toast。
  - `lib/tags.ts` 新增 `collectTagUsage(categories, families, contacts)`——标签 → 使用处数量统计（口径 = 实际挂载处，knownTags 库条目不计）。
  - 设置 → 通用/基础 末尾新增「标签管理」块（TagManagerBlock）：列表（使用数徽标，0 显示「仅标签库」）+ 拼音搜索（复用 lib/pinyin）+ 新建（入 knownTags，重名拦截）+ 行内重命名（撞名合并 toast）+ 删除（AlertDialog 确认，显示将清理的引用数）。
  - 联系人 roles 的顿号/逗号分隔此前已做好（`split(/[、,，]/)` + placeholder「用顿号/逗号分隔」），本轮核实无需改动。
- typecheck / lint 均 0 错误。待主人目视确认（设置页区块交互、搜索、合并/删除提示）。

TODO 68. （状态：已完成）
@ todo 32
todo 32 效果未实现
用户在AI对话栏输入<blue>这是一段文字</blue>并回车后（借AI对话栏自动渲染富文本来看效果），显示的文本为<blue>这是一段文字 后面的</blue>显示上被吞掉，点击复制文字后可以确认原文仍为<blue>这是一段文字</blue>请调查无法渲染的根因

- 根因已查明并修复（2026-10-05/06）：`lib/format-colors.ts` 的 `FORMAT_COLOR_TAG_AT` 是 `^<(/)?(色名)>$` **全锚定**正则，却同时用在两个语义不同的地方——`components/markdown-view.tsx`（marked 管线，对 html token **整串**匹配，全锚定正确）与 `components/richtext/format-color.ts`（TipTap 管线，AI 对话气泡渲染走这里，对 `slice(pos, pos+32)` **滑动窗口**匹配，需要前缀语义）。全锚定在滑动窗口下：文本中间的开标签（后面跟着文字，窗口非纯标签）永不命中 → `<blue>` 原样显示；扫到字符串末尾的 `</blue>` 时剩余窗口恰为标签本身 → 孤立命中，push 了没有配对 open 的 close token → 渲染成孤立 `</span>`，视觉上 `</blue>` 被吞。即：**开闭标签永远一坏一好，色标签管线此前从未真正渲染成功过**（32 一直处于未验证状态）。
- 修复：`lib/format-colors.ts` 新增 `FORMAT_COLOR_TAG_PREFIX`（`^<(/)?(色名)>` 无 `$` 尾锚）；`format-color.ts` 的 inline 规则改用 PREFIX，marked 路径继续用 AT（语义正确不动）。
- 验证：新建 `tests/format-colors.test.ts`（node:test，17 用例含根因回归样本：AT 仅末尾闭标签孤立命中 / PREFIX 开闭配对 / 16 色遍历 / `<blueberry>` 等误匹配防护 / marked 路径 AT 整串语义回归），`npm test` 全过。
- 顺带落地测试基建（主人提议，对齐 src/test 习惯）：`tests/` 目录 + `package.json` `test` script（node --test --experimental-strip-types，零新依赖）+ tsconfig `allowImportingTsExtensions` + 新增 `tests/contributions.test.ts`（04:00 翻篇口径常驻回归）；AGENTS.md 验收口径（TL;DR 1 / 第 2 节 / 红线 3、8、9 / Git 工作流 / 第 7 节测试约定）统一加入 `npm test`。
- typecheck / lint / test 均 0 错误。渲染效果待主人目视确认（`npm run dev` → AI 对话栏输入 `<blue>这是一段文字</blue>` 发送 → 用户气泡应显示蓝色「这是一段文字」）。
- 补漏（2026-10-06 主人目视反馈「标签匹配正常但仍无颜色」）：32 的第二处欠账——mark 的 `renderHTML` 只输出 `data-format-color` 属性，**全项目没有任何 CSS 消费它**（随笔预览的 marked 管线是自己上内联 style 的，所以只有那边有颜色）。修复：`renderHTML` 直接输出 `style: color: <hex>`（色值唯一来源 lib/format-colors.ts 的 FORMAT_COLOR_MAP），编辑态/只读态一并生效。typecheck / lint / test 复跑全绿；颜色效果待主人再次目视确认。

TODO 69. （状态：已完成）
允许关系族之间调整位置

- 已改（2026-10-05）：族 sidebar 行支持 HTML5 DnD 拖拽排序（交互与 app-sidebar 分类拖拽一致：落点行上半=插到它前面、下半=插到它后面；落点在自身原位或紧邻下一位视为没动不落库；重命名编辑态禁用拖拽）。存储不新增字段——顺序继续承载在 relationFamilies 的 key 插入顺序上，store 新增 `moveRelationFamily(familyId, toIndex)`（toIndex 为同分类族数组的目标插入索引，原数组口径；重建对象时同分类族按新顺序填回原有 key 槽位、其余分类族位置原样保留；搬迁弹窗等所有按 categoryId 过滤的消费方自动跟随新顺序）。typecheck / lint 均 0 错误。待主人目视确认拖拽手感与落点指示。

TODO 70. （状态：待处理）
当前docs规范风格的滑动条，会在深色主题颜色下，与背景融为一体，导致无法看到滑动条。
同时，滑动条过长时，在显示屏幕上滑动条的底部会出现白色矩形（这一条尚需多加验证，有时显示有时不显示的）
