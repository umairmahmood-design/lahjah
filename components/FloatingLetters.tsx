"use client";

import { useEffect, useState } from "react";

const AR_LETTERS = [
  "ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي",
];

interface LetterDef {
  id: number;
  letter: string;
  left: number;     // vw %
  top: number;      // vh % starting position
  size: number;     // px
  duration: number; // s
  delay: number;    // s (negative = already mid-flight)
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function FloatingLetters({ count = 22 }: { count?: number }) {
  const [letters, setLetters] = useState<LetterDef[]>([]);

  useEffect(() => {
    const defs: LetterDef[] = Array.from({ length: count }, (_, i) => {
      const letter = AR_LETTERS[Math.floor(Math.random() * AR_LETTERS.length)];
      return {
        id: i,
        letter,
        left: rand(0, 96),
        top: rand(20, 100),   // spread across full height at load time
        size: Math.round(rand(40, 120)),
        duration: rand(15, 30),
        delay: rand(-28, 0),  // pre-seed so letters are already drifting
      };
    });
    setLetters(defs);
  }, [count]);

  if (letters.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {letters.map((l) => (
        <span
          key={l.id}
          style={{
            position: "absolute",
            left: `${l.left}%`,
            top: `${l.top}%`,
            fontSize: `${l.size}px`,
            fontWeight: 700,
            fontFamily: "var(--font-noto-kufi), sans-serif",
            color: "rgba(255, 255, 255, 0.20)",
            animation: `float-letter ${l.duration}s ${l.delay}s linear infinite`,
            userSelect: "none",
            lineHeight: 1,
            willChange: "transform, opacity",
          }}
        >
          {l.letter}
        </span>
      ))}
    </div>
  );
}
