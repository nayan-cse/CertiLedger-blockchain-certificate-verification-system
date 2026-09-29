# Optional report tooling

The application requires only Node.js. Python is needed only if you want to regenerate the supplied PDF report after changing its identity text or measurements.

Install `reportlab` and `matplotlib`, and make DejaVu Sans / Sans Bold / Sans Mono available. The generator currently reads fonts from `/usr/share/fonts/truetype/dejavu`; on Windows, change the `FONT` path in `build_report.py` to your local folder containing those three `.ttf` files.

```sh
python -m pip install reportlab matplotlib
python tools/build_report.py
```

The generator reads actual files in `evidence/` and writes `docs/Assignment_2_Report.pdf`. It uses fixed page sections and generated charts. Verify the regenerated page count is at most 15 and visually check each page before printing. Add your name and registration ID in the cover table source first.

QR verification was performed with OpenCV 4.11.0, which is an evaluation aid rather than an application dependency. The generated PNG decoded to the expected URL; results are in `evidence/qr-validation.json`. To repeat, use `cv2.QRCodeDetector().detectAndDecode(cv2.imread('evidence/sample-qr.png'))` and compare the result with `demonstration.json`'s `qrUrl`.

The project ZIP contains no video. Normal setup, demo, tests and performance evaluation do not need Python or these document tools.
