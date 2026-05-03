"""
Scan damaged thumbs-source.zip for the 6 missing DIFUSION pictureIds.
Since the central directory is corrupt, we'll walk local file headers ourselves.
ZIP local file header signature: b'PK\\x03\\x04'
"""
import struct
import sys
import os

ZIP_PATH = r"C:\Users\DELL\OneDrive\Desktop\work\masterEducation\211 urun gorselsiz\archive\thumbs-source.zip"
OUT_DIR = r"C:\Users\DELL\OneDrive\Desktop\work\masterEducation\211 urun gorselsiz\recovered-difusion"

# We want these pictureIds (zero-padded to 7 digits)
WANTED = {
    "0295204": 65920,  # CARROUSEL 1 GUIDE PEDAGOGIQUE
    "0295218": 65626,  # TADAM 1 LIVRE ET CAHIER
    "0295219": 65921,  # LES CLES DU DELF A2
    "0295242": 65922,  # A PLUS 4 CAHIER EXERCICES
    "0295248": 65923,  # A PLUS 5 CAHIER DEXERCICES
    "0295299": 65924,  # A PLUS 5 ED HYBRIDE
}

os.makedirs(OUT_DIR, exist_ok=True)

found = {}
sig = b'PK\x03\x04'
buf_size = 64 * 1024 * 1024  # 64MB chunks
overlap = 1024  # keep tail for signature boundary

with open(ZIP_PATH, "rb") as fh:
    file_size = os.path.getsize(ZIP_PATH)
    print(f"Zip size: {file_size / 1e9:.2f} GB")

    pos = 0
    tail = b""
    scanned = 0

    while True:
        chunk = fh.read(buf_size)
        if not chunk:
            break
        data = tail + chunk
        # Find all local file header signatures in this chunk
        offset = 0
        while True:
            idx = data.find(sig, offset)
            if idx == -1:
                break
            # Absolute position in file
            abs_pos = pos + idx - len(tail)
            # Parse local file header (30 bytes fixed + variable)
            if idx + 30 > len(data):
                break
            header = data[idx:idx+30]
            try:
                (_sig, version, flags, method, mtime, mdate, crc,
                 comp_size, uncomp_size, fname_len, extra_len) = struct.unpack("<IHHHHHIIIHH", header)
            except struct.error:
                offset = idx + 1
                continue
            # Read filename
            if idx + 30 + fname_len > len(data):
                # Not enough buffered; seek-read directly
                fh.seek(abs_pos + 30)
                fname_bytes = fh.read(fname_len)
                fh.seek(pos + len(chunk))  # restore
            else:
                fname_bytes = data[idx+30:idx+30+fname_len]
            try:
                fname = fname_bytes.decode("utf-8", errors="replace")
            except Exception:
                fname = ""

            # Check for pictureId match - look for 7-digit padded ID at start of basename
            basename = os.path.basename(fname)
            for pid_str, nopid in WANTED.items():
                if basename.startswith(pid_str):
                    # Extract — read comp_size bytes from (abs_pos + 30 + fname_len + extra_len)
                    data_offset = abs_pos + 30 + fname_len + extra_len
                    print(f"  HIT: {basename}  (pid={pid_str}, nopId={nopid}, method={method}, comp={comp_size}, uncomp={uncomp_size})")
                    # Extract
                    try:
                        fh.seek(data_offset)
                        raw = fh.read(comp_size)
                        if method == 0:  # stored
                            payload = raw
                        elif method == 8:  # deflate
                            import zlib
                            payload = zlib.decompress(raw, -zlib.MAX_WBITS)
                        else:
                            print(f"    Unsupported method {method}")
                            payload = None
                        if payload is not None:
                            out_path = os.path.join(OUT_DIR, basename)
                            with open(out_path, "wb") as wfh:
                                wfh.write(payload)
                            print(f"    -> wrote {out_path} ({len(payload)} bytes)")
                            found.setdefault(pid_str, []).append(basename)
                        fh.seek(pos + len(chunk))  # restore read position
                    except Exception as e:
                        print(f"    extract failed: {e}")
                    break

            offset = idx + 1

        scanned += len(chunk)
        if scanned % (buf_size * 4) < buf_size:
            pct = 100 * (pos + len(chunk)) / file_size
            print(f"  scanned {pct:.1f}% ({(pos+len(chunk))/1e9:.2f} GB), found so far: {sum(len(v) for v in found.values())}")

        # Prepare next iteration
        pos += len(chunk)
        tail = data[-overlap:] if len(data) > overlap else data
        # But re-position file pointer correctly
        # (we used fh.seek() for extraction; restore)
        fh.seek(pos)

print("\n=== Summary ===")
for pid_str, nopid in WANTED.items():
    hits = found.get(pid_str, [])
    print(f"  {pid_str} (nopId {nopid}): {len(hits)} file(s)")
    for h in hits:
        print(f"    - {h}")
