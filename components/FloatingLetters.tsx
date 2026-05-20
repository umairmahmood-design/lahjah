"use client";

import { useEffect, useState } from "react";

const AR_LETTERS = [
  "ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي",
];
const EN_LETTERS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
];
const ALL_LETTERS = [...AR_LETTERS, ...EN_LETTERS];

interface LetterDef {
  id: number;
  letter: string;
  isArabic: boolean;
  left: number;     // vw %
  top: number;      // vh % starting position
  size: number;     // px
  duration: number; // s
  delay: number;    // s (negative = already mid-flight)
  opacity: number;
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function FloatingLetters({ count = 22 }: { count?: number }) {
  const [letters, setLetters] = useState<LetterDef[]>([]);

  useEffect(() => {
    const defs: LetterDef[] = Array.from({ length: count }, (_, i) => {
      const letter = ALL_LETTERS[Math.floor(Math.random() * ALL_LETTERS.length)];
      return {
        id: i,
        letter,
        isArabic: AR_LETTERS.includes(letter),
        left: rand(0, 96),
        top: rand(20, 100),   // spread across full height at load time
        size: Math.round(rand(40, 120)),
        duration: rand(15, 30),
        delay: rand(-28, 0),  // pre-seed so letters are already drifting
        opacity: rand(0.07, 0.12),
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
            fontFamily: l.isArabic
              ? "var(--font-noto-kufi), sans-serif"
              : "inherit",
            color: "#222629",
            opacity: l.opacity,
            animation: `letter-drift ${l.duration}s ${l.delay}s linear infinite`,
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
