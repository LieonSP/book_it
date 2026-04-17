# /start

Entry point for the Book_it feature pipeline.

Usage: `/start <issue number>`

This command delegates immediately to the Product Owner agent:

```
/po <issue number>
```

The full pipeline then runs automatically:
1. `/po` — enriches the issue, asks clarifying questions, triggers `/designer` or `/build`
2. `/designer` — proposes 3 design versions, triggers `/po design-review`
3. `/po design-review` — approves the build prompt, triggers `/build`
4. `/build` — implements, QA, deploys
