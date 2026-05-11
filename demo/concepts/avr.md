---
title: AVR
tags: [digital, mcu, embedded]
links:
  - arduino-uno
---

# AVR Microcontrollers

AVR is Microchip's (formerly Atmel's) 8-bit RISC microcontroller architecture, famous for being the heart of the original Arduino. With a Harvard architecture (separate instruction and data buses), AVR executes most instructions in a single clock cycle at up to 20MHz.

Despite being 8-bit, AVR MCUs are capable of sophisticated real-time control: PWM, UART, SPI, I²C, ADC, and hardware timers are all built in. The ATmega328P — the chip on the Arduino Uno — has 32KB flash, 2KB RAM, and 1KB EEPROM.

The AVR toolchain (`avr-gcc`, `avrdude`) is mature and thoroughly documented. For beginners, the Arduino ecosystem abstracts it; for advanced users, direct register manipulation gives cycle-accurate control.
