---
title: Sessions
description: The transcript, the queue, and a session's status.
---

A session is one conversation with an agent. It keeps running on the server whether or not a tab is open.

## Status

```d2 sketch width=420 title="A session's status"
direction: down
idle: Idle
running: Running {style.bold: true}
waiting: Waiting for you
failed: Failed {style.stroke: "#e5484d"}

idle -> running: prompt
running -> idle: turn ends
running -> waiting: agent asks
waiting -> running: you answer
running -> failed: error
failed -> running: retry
```

## The queue

Prompts you send while the agent works wait in the queue. **Steer** delivers one at the agent's next step instead of after its turn.
