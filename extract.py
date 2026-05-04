#!/usr/bin/env python3
"""
Extractor for Archibald's Adventures (Rake in Grass, 2008) data.pdb.

The container is a standard PalmOS PDB file:
  - 78 bytes header (ends at 0x4E)
  - numRecords * 8 bytes of record entries (each: 4-byte big-endian offset,
    1-byte attributes, 3-byte unique id)
  - 2 bytes of placeholder padding
  - record bodies, each running until the next record's offset (or EOF)

Record 0 is an internal index. After some binary lookup tables it contains the
literal string "__lookup__\\0" followed by the null-terminated filenames of
every other record, in the same order as records 1..N-1. The payloads are
stored uncompressed.

Usage:
    python3 extract.py [path/to/data.pdb] [output_dir]

Defaults: data.pdb in the current directory, extracted to ./extracted/.
"""

from __future__ import annotations

import os
import struct
import sys
from pathlib import Path


def parse_pdb(pdb_path: Path):
    data = pdb_path.read_bytes()

    # PDB header
    name = data[0:32].split(b"\x00", 1)[0].decode("latin-1", errors="replace")
    type_code = data[0x3C:0x40].decode("latin-1", errors="replace")
    creator = data[0x40:0x44].decode("latin-1", errors="replace")
    num_records = struct.unpack(">H", data[0x4C:0x4E])[0]

    # Record entry table
    entries = []
    for i in range(num_records):
        off = 0x4E + i * 8
        chunk_id, attr_uid = struct.unpack(">II", data[off : off + 8])
        attr = (attr_uid >> 24) & 0xFF
        uid = attr_uid & 0x00FFFFFF
        entries.append((chunk_id, attr, uid))

    # Sizes (delta to next record offset, last one runs to EOF)
    offsets = [e[0] for e in entries]
    sizes = []
    for i, off in enumerate(offsets):
        end = offsets[i + 1] if i + 1 < len(offsets) else len(data)
        sizes.append(end - off)

    return {
        "data": data,
        "name": name,
        "type": type_code,
        "creator": creator,
        "num_records": num_records,
        "entries": entries,
        "sizes": sizes,
    }


def extract_filenames(pdb) -> list[str]:
    data = pdb["data"]
    rec0_start, _, _ = pdb["entries"][0]
    rec0_size = pdb["sizes"][0]
    record0 = data[rec0_start : rec0_start + rec0_size]

    marker = b"__lookup__\x00"
    idx = record0.find(marker)
    if idx < 0:
        raise RuntimeError("__lookup__ marker not found in record 0")

    raw = record0[idx + len(marker) :]
    parts = raw.split(b"\x00")
    return [p.decode("latin-1") for p in parts if p]


def safe_join(root: Path, rel_path: str) -> Path:
    """Join while preventing path-traversal escapes."""
    rel = rel_path.replace("\\", "/").lstrip("/")
    target = (root / rel).resolve()
    if root.resolve() not in target.parents and target != root.resolve():
        raise RuntimeError(f"Refusing to write outside output dir: {rel_path}")
    return target


def main() -> int:
    pdb_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data.pdb")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("extracted")

    if not pdb_path.is_file():
        print(f"Error: {pdb_path} not found", file=sys.stderr)
        return 1

    pdb = parse_pdb(pdb_path)
    print(f"PDB name='{pdb['name']}' type='{pdb['type']}' creator='{pdb['creator']}'")
    print(f"Records: {pdb['num_records']}")

    filenames = extract_filenames(pdb)
    expected = pdb["num_records"] - 1
    print(f"Filenames in lookup: {len(filenames)} (expected {expected})")
    if len(filenames) != expected:
        print(
            "Warning: filename count does not match record count; "
            "extraction will proceed for the overlap.",
            file=sys.stderr,
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped = 0
    by_ext: dict[str, int] = {}

    n = min(len(filenames), expected)
    for i in range(n):
        rec_index = i + 1  # records 1..N-1 hold payloads
        offset, _attr, _uid = pdb["entries"][rec_index]
        size = pdb["sizes"][rec_index]
        payload = pdb["data"][offset : offset + size]

        rel = filenames[i]
        target = safe_join(out_dir, rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        written += 1

        ext = os.path.splitext(rel)[1].lower() or "(none)"
        by_ext[ext] = by_ext.get(ext, 0) + 1

    # Any extra records without a name go into _unmapped/
    for i in range(n, expected):
        rec_index = i + 1
        offset, _attr, _uid = pdb["entries"][rec_index]
        size = pdb["sizes"][rec_index]
        payload = pdb["data"][offset : offset + size]
        target = out_dir / "_unmapped" / f"record_{rec_index:04d}.bin"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        skipped += 1

    print(f"Wrote {written} files to {out_dir}")
    if skipped:
        print(f"Wrote {skipped} unnamed records into {out_dir / '_unmapped'}")

    print("By extension:")
    for ext, count in sorted(by_ext.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {ext:<10} {count}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
