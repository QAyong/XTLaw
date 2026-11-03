# Models and tools

XTLaw is your workspace. You choose the models, working methods, and external tools.

## Model services

Configure your provider in settings, then choose a model for a task. Services may require an API key or account authorization, and support different models and capabilities.

Choose a model that fits the work. Simple summaries may need a lighter model; complex reasoning and tool use need suitable capabilities. Images and other modalities depend on the particular model and tools.

Providers manage their own fees and quotas. For connection errors, check credentials, service URL, model name, and network access first.

## Skills: bring your methods

Skills provide reusable methods and instructions, such as a research or writing workflow. Review their source and content, and enable only what you trust and need.

Skills are not a permission sandbox. File and tool operations remain subject to the relevant authorization process.

## MCP: connect your tools

MCP connects external tools and services. Add a connection in settings, check its status and available tools, and use it where needed.

External tools may read data, run programs, or send content to third parties. Review their source and permissions, and keep unnecessary sensitive information out of task context.

## Tool calling mode

Open **Settings → Runtime → Tool calling mode** to choose a mode:

- **Mixed**: call tools directly for simple actions, or use code to batch queries and filter results.
- **Code orchestration**: ordinary tools must be called through scripts, requiring a model that reliably generates valid code.
- **Off**: disable code orchestration and call available tools directly.

Mode changes apply from the next run, and all calls follow task permissions. After upgrading, previously enabled configurations use Mixed mode; previously disabled configurations remain off. Select Code orchestration to keep calling ordinary tools exclusively through scripts.

## Data and permissions

A local workspace does not mean every piece of data stays on your computer. Content sent to online models, tool results, and data submitted to external services are handled by those services.

Provide only the material needed and check the scope before granting access.
