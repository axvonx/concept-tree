---
title: Programming Paradigms
tags: [cs]
links:
  - object-oriented
  - functional-programming
---

# Programming Paradigms

A programming paradigm is a style or approach to programming that provides a framework for thinking about and structuring code.

## Major Paradigms

| Paradigm | Key Idea | Example Languages |
|----------|----------|-------------------|
| Imperative | Explicit step-by-step instructions | C, Assembly |
| Object-oriented | Organizes code around objects and classes | Java, Python |
| Functional | Computation as evaluation of functions | Haskell, Elixir |
| Declarative | Describes *what* to compute, not *how* | SQL, HTML |
| Concurrent | Multiple computations running simultaneously | Go, Erlang |

## Hello World Comparison

```c
#include <stdio.h>
int main() {
    printf("Hello, world!");
    return 0;
}
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

if __name__ == "__main__":
    print(greet("world"))
```

```javascript
const greet = (name) => `Hello, ${name}!`;
console.log(greet("world"));
```

## Paradigm Checklist

- [x] Understand imperative programming
- [x] Learn at least one OOP language
- [ ] Try a purely functional language
- [ ] Explore logic programming (Prolog)
- [ ] Study actor-model concurrency

> "There are only two kinds of languages: the ones people complain about and the ones nobody uses." — Bjarne Stroustrup
