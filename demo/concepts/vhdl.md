---
title: VHDL
tags: [digital, hdl, programming]
---

# VHDL

VHDL (VHSIC Hardware Description Language) was developed for the US Department of Defense and is strongly typed, verbose, and explicit — every signal type must be declared, every port direction specified. This verbosity becomes an asset in large designs where discipline prevents bugs.

VHDL is dominant in aerospace, defense, and Europe's academic institutions. It uses an Ada-like syntax:

```vhdl
entity blink is
  port (clk : in std_logic; led : out std_logic);
end blink;

architecture rtl of blink is
  signal counter : unsigned(23 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      counter <= counter + 1;
      if counter = 0 then led <= not led; end if;
    end if;
  end process;
end rtl;
```

**Learn:** [VHDL Whiz](https://vhdlwhiz.com) — structured VHDL tutorials from scratch.
