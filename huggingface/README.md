---
title: BottleSort AI
emoji: "🏭"
colorFrom: green
colorTo: blue
sdk: static
app_file: index.html
fullWidth: true
pinned: false
short_description: AI bottle inspection and automated conveyor sorting simulation
tags:
  - industrial-automation
  - machine-learning
  - image-classification
  - simulation
---

# BottleSort-AI — BottleSort Lab

A working AI bottle inspection and automated conveyor sorting simulation for Kunene.

Start the virtual conveyor or inspect one bottle, then send missing-cap and tilted-cap examples. A trained multiclass logistic regression model classifies synthetic camera pixels. The controller routes each bottle to accept, reject, or review using the selected confidence threshold.

Explore the model's probabilities, held-out confusion matrix, inspection settings, activity log, and CSV export. The project download includes the source code, executed training notebook, and project report.

Inference runs in your browser. Run history and control settings are stored in that browser. All camera images and production events are synthetic; this is an educational simulation.

Source and deployment instructions: [OagengKunene/BottleSort-AI on GitHub](https://github.com/OagengKunene/BottleSort-AI).

This Space receives the application's static files from GitHub Actions using a repository-scoped Trusted Publisher. No account password or long-lived access token is stored in the workflow.
