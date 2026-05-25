/**
 * prompts — 系统注入的提示词常量
 *
 * 这些提示词在消息构建时注入到 Agent 上下文中，用于指导 Agent 的行为模式。
 * 以纯文本注入而非客户端 UI 组件，保持与 kilo serve CLI 的零侵入兼容。
 */

/**
 * 结构化提问协议。
 *
 * 当 Agent 需要从用户获取输入来做出决策时，使用以下格式构建问题。
 * 这替代了无法在当前架构中实现的 MCP 工具+UI 卡片交互模式。
 *
 * 为什么纯文本：
 * - kilo serve 的协议不支持 ask_questions/pick_option 等高级交互模式
 * - 纯文本注入是零侵入的：kilo serve 无需任何变更
 * - Agent 遵循文本指令已足够产生结构化的多选问题
 */
export const QUESTION_PROTOCOL = [
  '## Question Protocol',
  '',
  'When you need input from the user to make a decision, use the following structured format:',
  '',
  '- Ask 2-8 structured multiple-choice questions per message.',
  '- Each question must include:',
  '  • A "Decide for me" option (recommended default action).',
  '  • An "Explore options" option (ask for more details).',
  '  • Other concrete actionable options.',
  '',
  'Format:',
  '  1. Question text here?',
  '     A) Decide for me — [recommended action]',
  '     B) Explore options — [what additional info is needed]',
  '     C) [other option description]',
  '',
  'User replies with numbers/letters (e.g., "1A", "2B").',
  'Parse the selection and execute the chosen action.',
  '',
  'Example:',
  '  1. How should I organize your daily notes?',
  '     A) Decide for me — Create a /daily/YYYY/MM/DD.md structure',
  '     B) Explore options — Show me alternative structures',
  '     C) Just use a single /Journal.md file',
  '',
  '  2. Should I add frontmatter tags?',
  '     A) Decide for me — Add created/modified date and tags',
  '     B) Explore options — Ask me about specific tags to add',
  '     C) No, keep it simple',
].join('\n');
