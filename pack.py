#!/usr/bin/env python3
"""
Repacker for Archibald's Adventures (Rake in Grass, 2008) data.pdb.

Inverse of extract.py. Takes the extracted folder plus the ORIGINAL data.pdb
(used as a template for the PDB header, record 0 lookup-table prefix, the
filename ordering, and per-record attr/uid metadata) and produces a new
data.pdb in which each record's payload is replaced with the current contents
of the corresponding file under the extracted folder.

Because all record offsets are recomputed from scratch, individual payloads
can grow or shrink freely; the resulting PDB will always be internally
consistent. Whether the game itself tolerates a resized payload depends on
the engine, not on the container format.

Usage:
    python3 pack.py [original_data.pdb] [extracted_dir] [output.pdb]

Defaults: data.pdb, extracted/, data_repacked.pdb
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path


HEADER_SIZE = 0x4E
ENTRY_SIZE = 8


def parse_pdb(data: bytes):
    num_records = struct.unpack(">H", data[0x4C:0x4E])[0]
    entries = []
    for i in range(num_records):
        off = HEADER_SIZE + i * ENTRY_SIZE
        chunk_id, attr_uid = struct.unpack(">II", data[off : off + ENTRY_SIZE])
        entries.append((chunk_id, attr_uid))
    offsets = [e[0] for e in entries]
    sizes = [
        (offsets[i + 1] if i + 1 < len(offsets) else len(data)) - off
        for i, off in enumerate(offsets)
    ]
    return num_records, entries, sizes


def get_record_bytes(data: bytes, entries, sizes, i: int) -> bytes:
    off = entries[i][0]
    return data[off : off + sizes[i]]


def split_record0(rec0: bytes) -> tuple[bytes, list[str], int]:
    """Return (prefix_through_marker, filenames, trailing_pad_byte_count)."""
    marker = b"__lookup__\x00"
    idx = rec0.find(marker)
    if idx < 0:
        raise RuntimeError("__lookup__ marker not found in record 0")
    prefix = rec0[: idx + len(marker)]
    tail = rec0[idx + len(marker) :]
    # Count trailing zero bytes (padding past the last terminator).
    trailing = 0
    while trailing < len(tail) and tail[len(tail) - 1 - trailing] == 0:
        trailing += 1
    # The last real filename keeps its own \x00 terminator, so the padding is
    # whatever zero bytes sit AFTER that terminator.
    if trailing > 0:
        trailing -= 1  # subtract the legitimate terminator on the final name
    names = [p.decode("latin-1") for p in tail.split(b"\x00") if p]
    return prefix, names, trailing


def build_record0(prefix: bytes, names: list[str], trailing_pad: int) -> bytes:
    body = bytearray(prefix)
    for n in names:
        body += n.encode("latin-1") + b"\x00"
    body += b"\x00" * trailing_pad
    return bytes(body)


def main() -> int:
    orig_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data.pdb")
    src_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("extracted")
    out_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("data_repacked.pdb")

    if not orig_path.is_file():
        print(f"Error: {orig_path} not found", file=sys.stderr)
        return 1
    if not src_dir.is_dir():
        print(f"Error: {src_dir} not a directory", file=sys.stderr)
        return 1

    data = orig_path.read_bytes()
    num_records, entries, sizes = parse_pdb(data)

    # Original record 0: lookup-table prefix (kept verbatim) + filename list.
    rec0 = get_record_bytes(data, entries, sizes, 0)
    rec0_prefix, names, rec0_trailing = split_record0(rec0)

    expected = num_records - 1
    if len(names) != expected:
        print(
            f"Warning: original lookup has {len(names)} names but {expected} "
            "payload records; using the overlap.",
            file=sys.stderr,
        )

    # Preserve any gap bytes between the entry table and record 0 (PalmOS
    # databases conventionally have 2 placeholder bytes here, but compute it
    # from the original to be safe).
    entry_table_end = HEADER_SIZE + num_records * ENTRY_SIZE
    gap_bytes = data[entry_table_end : entries[0][0]]

    # Read each payload from the extracted folder. Missing files fall back to
    # the original record bytes so partial edits still produce a valid PDB.
    payloads: list[bytes] = []
    reused = 0
    resized = 0
    n = min(len(names), expected)
    for i in range(n):
        rec_index = i + 1
        rel = names[i].replace("\\", "/")
        f = src_dir / rel
        if f.is_file():
            payload = f.read_bytes()
            payloads.append(payload)
            if len(payload) != sizes[rec_index]:
                resized += 1
        else:
            payloads.append(get_record_bytes(data, entries, sizes, rec_index))
            reused += 1

    # Carry over any extra unnamed records (the _unmapped/ ones) verbatim.
    extras: list[bytes] = []
    for rec_index in range(n + 1, num_records):
        extras.append(get_record_bytes(data, entries, sizes, rec_index))

    new_rec0 = build_record0(rec0_prefix, names[:n], rec0_trailing)
    all_records = [new_rec0] + payloads + extras
    record_count = len(all_records)

    # Recompute offsets. Body region starts after header + entry table + gap.
    body_start = HEADER_SIZE + record_count * ENTRY_SIZE + len(gap_bytes)
    new_offsets = []
    cursor = body_start
    for rec in all_records:
        new_offsets.append(cursor)
        cursor += len(rec)

    # Build output buffer: header (with patched numRecords) + entries + gap + bodies.
    out = bytearray(data[:HEADER_SIZE])
    struct.pack_into(">H", out, 0x4C, record_count)

    for i in range(record_count):
        attr_uid = entries[i][1] if i < num_records else 0
        out += struct.pack(">II", new_offsets[i], attr_uid)

    out += gap_bytes
    for rec in all_records:
        out += rec

    out_path.write_bytes(out)

    total_in = sum(sizes)
    total_out = sum(len(r) for r in all_records)
    print(f"Wrote {out_path} ({len(out):,} bytes)")
    print(f"Records: {record_count}  reused-from-original: {reused}  resized: {resized}")
    print(f"Total payload: {total_out:,} bytes (was {total_in:,})")
    if resized:
        print(
            "Note: some payloads changed size. The PDB is valid; whether the "
            "game accepts the new sizes depends on engine buffer limits."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
