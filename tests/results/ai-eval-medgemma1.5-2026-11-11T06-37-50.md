# AI evaluation: medgemma1.5

Endpoint: http://localhost:11434/v1  
Date: 2026-11-11T06:37:50.908Z  
Cases: 12 synthetic patients (tests/scenarios.js)

Rule engine leading possibility correct: 12/12 (the synthetic cases were written for the engine, so treat this as a sanity check, not a benchmark).

## Mode: blind

| Measure | Score |
|---|---|
| Valid JSON | 12/12 (100%) |
| Leading possibility correct (top-1) | 3/12 (25%) |
| Correct within first 3 (top-3) | 5/12 (42%) |
| Weaker side correct | 12/12 (100%) |
| Emergency handled correctly | 6/12 (50%) |
| Overclaimed a diagnosis | 0/12 |
| Average response time | 30.0 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | Bell's palsy | ✓ | ✓ | ✓ | ✗ |
| stroke | stroke | Stroke | ✓ | ✓ | ✓ | ✗ |
| normal | normal_variation | No facial asymmetry | ✗ | ✗ | ✓ | ✓ |
| myasthenia | myasthenia | Myasthenia Gravis | ✓ | ✓ | ✓ | ✓ |
| cn3 | cn3 | Bell's palsy | ✗ | ✓ | ✓ | ✗ |
| ramsay_hunt | ramsay_hunt | Bell's palsy | ✗ | ✗ | ✓ | ✓ |
| cn12 | cn12 | Stroke | ✗ | ✗ | ✓ | ✓ |
| cn5 | cn5_motor | Bell's palsy | ✗ | ✗ | ✓ | ✓ |
| hemifacial_spasm | hemifacial_spasm | Facial nerve palsy | ✗ | ✗ | ✓ | ✓ |
| gbs | gbs | Bell's palsy | ✗ | ✗ | ✓ | ✗ |
| horner | horner | Ptosis | ✗ | ✓ | ✓ | ✗ |
| parkinsonism | parkinsonism | Facial nerve palsy (bilateral) | ✗ | ✗ | ✓ | ✗ |

## Mode: assist

| Measure | Score |
|---|---|
| Valid JSON | 12/12 (100%) |
| Leading possibility correct (top-1) | 12/12 (100%) |
| Correct within first 3 (top-3) | 12/12 (100%) |
| Weaker side correct | 12/12 (100%) |
| Emergency handled correctly | 10/12 (83%) |
| Overclaimed a diagnosis | 0/12 |
| Average response time | 29.5 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | Bell's palsy (idiopathic facial nerve palsy) | ✓ | ✓ | ✓ | ✓ |
| stroke | stroke | Stroke | ✓ | ✓ | ✓ | ✓ |
| normal | normal_variation | Normal facial asymmetry (moderate, routine) | ✓ | ✓ | ✓ | ✓ |
| myasthenia | myasthenia | Myasthenia gravis | ✓ | ✓ | ✓ | ✓ |
| cn3 | cn3 | Third nerve (oculomotor) palsy | ✓ | ✓ | ✓ | ✓ |
| ramsay_hunt | ramsay_hunt | Ramsay Hunt syndrome (herpes zoster oticus) | ✓ | ✓ | ✓ | ✗ |
| cn12 | cn12 | Hypoglossal nerve (CN XII) weakness | ✓ | ✓ | ✓ | ✓ |
| cn5 | cn5_motor | Trigeminal motor weakness (CN V3) | ✓ | ✓ | ✓ | ✓ |
| hemifacial_spasm | hemifacial_spasm | Hemifacial spasm | ✓ | ✓ | ✓ | ✓ |
| gbs | gbs | Guillain-Barré syndrome | ✓ | ✓ | ✓ | ✓ |
| horner | horner | Horner syndrome | ✓ | ✓ | ✓ | ✓ |
| parkinsonism | parkinsonism | Parkinsonism | ✓ | ✓ | ✓ | ✗ |
