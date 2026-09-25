TODO 1. （状态：已完成）
接入诗歌api (https://poetry.palemoky.com/api/poems/random)，并在 profile dashboard 右下角下面增加小字标注出处 "——《xxx》"

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

TODO 11. （状态：待处理）
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

TODO 22. （状态：待处理）
通知方式（通道 / notifier）可配置：目前 sender 产生消息后只有「内置右下角弹窗」一种投递方式。
未来会新增 QQ 互联等通道，通知方式将包括内置通知和 QQ 通知两种或更多。
需要把投递层抽象成统一的 notifier 接口（sender → 事件 → 按 用户配置 分发给启用的 notifier），
弹窗（内置通知）只是其中一种 notifier 实现；通知方式的选择 UI 放设置页「通知」分区。

TODO 23. （状态：待处理）
通知中心多 sender 支持：当前数据源只有内置的 GitHub sender，未来可能接入更多消息源
（如新闻页：定时获取新闻并推送为通知）。sender 抽象已预留 senderId（lib/notifications/senders.ts 有展示注册表），
需要完善：多 sender 的注册与启停管理、通知中心按 sender 筛选/分组展示、每个 sender 各自的配置分区等。
