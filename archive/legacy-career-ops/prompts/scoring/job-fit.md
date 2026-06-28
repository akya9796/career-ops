# Job Fit Scoring Prompt

Evaluate the job against the structured profile and the scoring dimensions in
`config/scoring/job-fit.yml`.

Rules:

- Return a 0-100 score.
- Do not invent experience, skills, employers, degrees, certifications, work authorization, or achievements.
- Use only the master CV structured profile, configured target profile, approved knowledge files, and the job description.
- State the facts used from the CV.
- State facts inferred from the job description.
- State facts not allowed to claim.
- Include confidence and hallucination risk.
- If Swiss work authorization is unclear, say it is unclear and evaluate Permit G / border-worker relevance only as a possibility.

