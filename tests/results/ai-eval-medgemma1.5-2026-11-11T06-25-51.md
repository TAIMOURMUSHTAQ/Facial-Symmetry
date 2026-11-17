# AI evaluation: medgemma1.5

Endpoint: http://localhost:11434/v1  
Date: 2026-11-11T06:25:51.890Z  
Cases: 3 synthetic patients (tests/scenarios.js)

Rule engine leading possibility correct: 3/3 (the synthetic cases were written for the engine, so treat this as a sanity check, not a benchmark).

## Mode: blind

| Measure | Score |
|---|---|
| Valid JSON | 3/3 (100%) |
| Leading possibility correct (top-1) | 1/3 (33%) |
| Correct within first 3 (top-3) | 2/3 (67%) |
| Weaker side correct | 3/3 (100%) |
| Emergency handled correctly | 0/3 (0%) |
| Overclaimed a diagnosis | 0/3 |
| Average response time | 32.4 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | Bell's palsy | ✓ | ✓ | ✓ | ✗ |
| cn3 | cn3 | Bell's palsy | ✗ | ✓ | ✓ | ✗ |
| parkinsonism | parkinsonism | Facial nerve palsy (bilateral) | ✗ | ✗ | ✓ | ✗ |

## Mode: assist

| Measure | Score |
|---|---|
| Valid JSON | 3/3 (100%) |
| Leading possibility correct (top-1) | 3/3 (100%) |
| Correct within first 3 (top-3) | 3/3 (100%) |
| Weaker side correct | 3/3 (100%) |
| Emergency handled correctly | 2/3 (67%) |
| Overclaimed a diagnosis | 0/3 |
| Average response time | 27.8 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | Bell's palsy | ✓ | ✓ | ✓ | ✓ |
| cn3 | cn3 | Third nerve palsy | ✓ | ✓ | ✓ | ✓ |
| parkinsonism | parkinsonism | Parkinsonism | ✓ | ✓ | ✓ | ✗ |
