# Playground Workbench design

## Overview

Playground extends the DSH workspace. Follow the native application’s typography,
theme and interaction conventions. Keep the controller conversation central and
show delegated tasks beside it. Use flat regions and concise labels.

## Colors

Use DSH semantic variables for text, surfaces, borders, hover and error states.
The controller uses `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`,
`--dsw-alias-bg-base` and `--dsw-alias-border-l3`. Do not replace the host theme
with fixed light colors. Selection uses the existing Playground accent.

## Typography

Inherit the application font. The compact controller heading uses 15 px text;
task headings use 14–15 px, secondary task labels use 12–13 px. Render returned
Markdown through DSH’s content factory so lists and code remain readable.

## Layout

Keep workspace selection, the 对话 / 赛题 / 提交 tabs, connection settings and
the task toggle in one compact header. Put 添加工作区 in the workspace selector.
Keep visited pages mounted so switching tabs preserves drafts and filters.

The conversation takes the available width. The task pane defaults to 380 px
and can be resized from 300 to 520 px by pointer or keyboard. When the content
region is 720 px wide or less, the pane overlays the conversation. Its close
action and Escape return focus to the toggle.

## Elevation & Depth

Use borders between regions. Only the narrow task overlay uses a shadow to
distinguish it from the conversation underneath.

## Components

Task rows show a title and observed execution state. Selecting one opens its
details with a return action, formatted result, copy action and an expandable
original notice. Missing execution evidence is not a failed task. Confirmed
Mnemon maintenance tasks belong in a collapsed background-maintenance group.

The task toggle appears only on the conversation page. It resembles DSH’s
sidebar control but does not claim the native right dock’s keyboard shortcut.
Local file references in sidebar Markdown are readable and copyable; native
file opening is not available from this renderer.

## Do's and Don'ts

- Preserve DSH’s native composer, send, stop, history and model controls.
- Keep keyboard focus visible and provide a keyboard route back from settings.
- Keep raw task evidence available without making it the default presentation.
- Do not infer task success from a title or a missing result notification.
- Do not present background maintenance as competition work.
