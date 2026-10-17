from pathlib import Path

p = Path(r".\src\Kerawanan.tsx")
s = p.read_text(encoding="utf-8")

fixes = {
    "âœ…": "OK",
    "âŒ": "ERROR",
    "âš ï¸": "WARNING",
    "âšï¸": "WARNING",
    "ðŸ”": "[AUTH]",
    "ðŸ”Ž": "[SEARCH]",
    "ðŸ”—": "[LINK]",
    "ðŸ”„": "[LOAD]",
    "ðŸŽ¯": "[TARGET]",
    "ðŸŽ¨": "[STYLE]",
    "ðŸ’¾": "[SAVE]",
    "ðŸ—‘ï¸": "[DELETE]",
    "ðŸ—ºï¸": "[MAP]",
    "ðŸ“": "[LOC]",
    "ðŸ“…": "[DATE]",
    "ðŸ·ï¸": "[TAG]",
    "ðŸ’§": "[WATER]",
    "ðŸŒ§ï¸": "[RAIN]",
    "ðŸŒ³": "[TREE]",
    "ðŸ“‹": "[LIST]",
    "ðŸŒ²": "[FOREST]",
    "ðŸŒ´": "[PALM]",
    "ðŸŒ±": "[PLANT]",
    "ðŸª¨": "[ROCK]",
    "ðŸ”ï¸": "[MOUNTAIN]",
    "â›°ï¸": "[MOUNTAIN]",
    "ðŸ”¥": "[FIRE]",
    "â˜€ï¸": "[SUN]",
    "ðŸŒŠ": "[WAVE]",
    "ðŸžï¸": "[LAND]",
    "ðŸŒ¿": "[LEAF]",
    "ðŸªµ": "[WOOD]",
    "ðŸ—ï¸": "[BUILD]",
    "â„¹ï¸": "[INFO]",
    "â³": "[WAIT]",
    "âœ“": "OK",
    "â€”": "—",
    "â†’": "→",
    "â€¢": "•",
    "Â±": "±",
    "â€¦": "…",
    "âˆ’": "−",
    "âŒ–": "⌖",
    "â–±": "▱",
    "â–¤": "▾",
    "â–¸": "▸",
    "â–¾": "▾",
    "â€œ": '"',
    "â€": '"',
}

count = 0

for old, new in fixes.items():
    n = s.count(old)
    if n:
        s = s.replace(old, new)
        count += n

p.write_text(s, encoding="utf-8")

print(f"Fixed {count} mojibake sequences.")
