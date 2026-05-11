---
title: DACs
tags: [analog, digital, conversion]
links:
  - pcm5102a
  - ad9833
---

# DACs (Digital-to-Analog Converters)

A DAC converts a binary number into a proportional analog voltage or current. This is the bridge between computation and the physical world — whenever a microcontroller needs to drive a speaker, set a motor speed, or output a waveform, it goes through a DAC.

Key specs to evaluate: **resolution** (bits — more bits = finer steps), **sample rate** (samples per second), and **output range**. An 8-bit DAC has 256 steps; a 16-bit DAC has 65,536 — the difference is audible in audio applications.
