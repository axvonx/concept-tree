---
title: Verilog
tags: [digital, hdl, programming]
---

# Verilog

Verilog is the dominant HDL in industry and open-source hardware, with C-like syntax that engineers find approachable. IEEE 1364 standardized it in 1995; SystemVerilog (IEEE 1800) extended it with OOP features, interfaces, and constrained-random verification in 2005.

A minimal Verilog module looks like:

```verilog
module blink (input clk, output reg led);
  reg [23:0] counter;
  always @(posedge clk) begin
    counter <= counter + 1;
    if (counter == 0) led <= ~led;
  end
endmodule
```

**Learn:** [HDLBits](https://hdlbits.01xz.net) — free online Verilog exercises with instant feedback. [Nandland](https://nandland.com) — beginner tutorials for FPGAs.
