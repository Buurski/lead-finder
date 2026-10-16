"""Lægger rigtige skærme ind i en GPT-annonce, hvor enhedernes skærme er nøglefarvede (magenta #FF00FF, grøn #00FF00, cyan #00FFFF).

Skærmen findes som største område i nøglefarven, de fire kanter tilpasses som rette linjer (så runde hjørner
og perspektiv ikke flytter hjørnerne), og skærmbilledet lægges ind med en perspektiv-transformation.
Det sorte Dynamic Island og alt andet, der ikke er nøglefarve, bliver liggende.

  python -I scripts/annonce-indsaet.py <gpt.png> <ud.png> magenta=<skaerm.png> [groen=<skaerm.png>] [cyan=<skaerm.png>] [logo=<logo.png>@x,y,b]
"""
import sys

import cv2
import numpy as np

NØGLE = {"magenta": (150, 18), "groen": (60, 18), "cyan": (90, 12)}  # OpenCV-hue (0-179) og tolerance


def maske(bgr, navn):
    hue, tol = NØGLE[navn]
    h, s, v = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV))
    m = ((abs(h.astype(int) - hue) <= tol) & (s > 110) & (v > 110)).astype(np.uint8) * 255
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n < 2:
        raise SystemExit(f"ingen {navn}-skærm fundet")
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    area = stats[i, cv2.CC_STAT_AREA]
    if area < 0.01 * m.size:
        raise SystemExit(f"{navn}-området er kun {area} px, for lille til en skærm")
    return (lab == i).astype(np.uint8) * 255


def linje(pts):
    vx, vy, x0, y0 = cv2.fitLine(pts.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    return np.array([x0, y0]), np.array([vx, vy])


def skæring(a, b):
    (p, r), (q, s) = a, b
    kryds = lambda u, v: u[0] * v[1] - u[1] * v[0]
    return p + kryds(q - p, s) / kryds(r, s) * r


def hjørner(m):
    """Fire hjørner (tl, tr, br, bl) fra kanterne, ikke fra de afrundede hjørnepunkter."""
    cnt = max(cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
    hull = cv2.convexHull(cnt)
    eps = 0.01 * cv2.arcLength(hull, True)
    approx = cv2.approxPolyDP(hull, eps, True)
    while len(approx) > 4:
        eps *= 1.2
        approx = cv2.approxPolyDP(hull, eps, True)
    if len(approx) != 4:
        raise SystemExit("kunne ikke finde fire kanter på skærmen")
    q = approx.reshape(4, 2).astype(float)
    # sortér tl, tr, br, bl
    s, d = q.sum(1), q[:, 0] - q[:, 1]
    q = np.array([q[np.argmin(s)], q[np.argmax(d)], q[np.argmax(s)], q[np.argmin(d)]])
    pts = cnt.reshape(-1, 2).astype(float)
    linjer = []
    for a, b in zip(q, np.roll(q, -1, axis=0)):
        ab = b - a
        n = np.array([-ab[1], ab[0]]) / np.linalg.norm(ab)
        t = (pts - a) @ ab / (ab @ ab)
        dist = abs((pts - a) @ n)
        # midterste 60 % af kanten; løs grænse først (skrå telefon), så strammes der ind om den fundne linje,
        # så fingre og chips, der dækker kanten, ikke trækker linjen
        nær = pts[(t > 0.2) & (t < 0.8) & (dist < 0.05 * np.linalg.norm(ab))]
        for tol in (12, 4):
            p, r = linje(nær)
            nr = np.array([-r[1], r[0]])
            nær = nær[abs((nær - p) @ nr) < tol]
        linjer.append(linje(nær))
    hj = np.array([skæring(linjer[i - 1], linjer[i]) for i in range(4)])
    if pts[:, 1].max() >= m.shape[0] - 3:
        # skærmen fortsætter ud over billedets bund: bundkanten er billedkanten, ikke skærmens.
        # Behold top og sider, og find bunden ud fra skærmens rigtige højde/bredde-forhold langs siderne.
        return hj, True
    return hj, False


def indsæt(bgr, navn, skærm_fil):
    m = maske(bgr, navn)
    skærm = cv2.imread(skærm_fil, cv2.IMREAD_COLOR)
    h, w = skærm.shape[:2]
    dst, beskåret = hjørner(m)
    if beskåret:
        tl, tr, br, bl = dst
        bredde = np.linalg.norm(tr - tl)
        for i, top in ((3, tl), (2, tr)):
            ret = dst[i] - top
            dst[i] = top + ret / np.linalg.norm(ret) * bredde * h / w
        print(f"{navn}: skærmen er beskåret af billedkanten, bunden regnet ud fra forholdet {h}/{w}")
    dst = dst.astype(np.float32)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    H = cv2.getPerspectiveTransform(src, dst)
    varp = cv2.warpPerspective(skærm, H, (bgr.shape[1], bgr.shape[0]), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    # dæk nøglefarvens antialiasede kant med 2 px, blødt overgang på 1 px
    # blød nøgle som i film: hver kantpixel får alfa efter hvor meget nøglefarve den indeholder (antialiasede
    # kanter, runde hjørner, fingre), og nøglefarvens skær fjernes fra kantens forgrund, så der ingen farvekant er
    mm = cv2.dilate(m, np.ones((7, 7), np.uint8))  # kun skærmens eget område og lige omkring det
    f = bgr.astype(float)
    b_, g_, r_ = f[..., 0], f[..., 1], f[..., 2]
    nøgle = {"magenta": np.minimum(r_, b_) - g_, "groen": g_ - np.maximum(r_, b_), "cyan": np.minimum(g_, b_) - r_}[navn]
    fuld = np.median(nøgle[m > 0])  # GPT's nøglefarve er sjældent helt ren, så ren skærm = medianen
    alfa = np.clip((nøgle / fuld - 0.15) / 0.7, 0, 1) * (mm > 0)
    alfa[m > 0] = np.maximum(alfa[m > 0], cv2.erode(m, np.ones((5, 5), np.uint8))[m > 0] / 255)  # aldrig huller inde i skærmen
    forgrund = f.copy()  # despill: træk nøglefarven ud af kantens forgrund (rammen, fingre, chips)
    if navn == "magenta":
        forgrund[..., 0] = np.minimum(b_, g_ + 8); forgrund[..., 2] = np.minimum(r_, g_ + 8)
    elif navn == "groen":
        forgrund[..., 1] = np.minimum(g_, np.maximum(r_, b_) + 8)
    else:
        forgrund[..., 0] = np.minimum(b_, r_ + 8); forgrund[..., 1] = np.minimum(g_, r_ + 8)
    forgrund = np.where((mm > 0)[..., None], forgrund, f)
    a3 = alfa[..., None]
    ud = np.clip(forgrund * (1 - a3) + varp * a3, 0, 255).astype(np.uint8)
    print(f"{navn}: hjørner {np.round(dst).astype(int).tolist()}")
    return ud, mm


def logo(bgr, fil, x, y, b):
    lg = cv2.imread(fil, cv2.IMREAD_UNCHANGED)
    hh = round(lg.shape[0] * b / lg.shape[1])
    lg = cv2.resize(lg, (b, hh), interpolation=cv2.INTER_AREA)
    a = lg[..., 3:4].astype(float) / 255
    bgr[y : y + hh, x : x + b] = (bgr[y : y + hh, x : x + b] * (1 - a) + lg[..., :3] * a).astype(np.uint8)
    return bgr


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    ind, ud = sys.argv[1], sys.argv[2]
    bgr = cv2.imread(ind, cv2.IMREAD_COLOR)
    brugte, skærme = [], np.zeros(bgr.shape[:2], np.uint8)
    for arg in sys.argv[3:]:
        k, v = arg.split("=", 1)
        if k == "logo":
            fil, pos = v.split("@")
            x, y, b = map(int, pos.split(","))
            bgr = logo(bgr, fil, x, y, b)
        else:
            bgr, mm = indsæt(bgr, k, v)
            brugte.append(k)
            skærme |= cv2.dilate(mm, np.ones((9, 9), np.uint8))
    # nøglefarvens genskin (fx lyserødt på gulvet under en magenta skærm): lysstyrken bevares (et blødt spejlbillede),
    # men farvetonen skiftes blødt til omgivelsernes, så der hverken er lyserødt eller en hård kant
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(float)
    w = np.zeros(bgr.shape[:2])
    for k in brugte:
        hue, tol = NØGLE[k]
        d = abs(hsv[..., 0] - hue)
        d = np.minimum(d, 180 - d)  # farvehjulet er cirkulært (rød ligger ved 0 og 180)
        nær = np.clip(1.2 - d / tol, 0, 1)  # smalt nok til at bordeaux (#7A1F2B, hue 176) ikke regnes som magenta
        w = np.maximum(w, nær * np.clip((hsv[..., 1] - 4) / 25, 0, 1))
    w[skærme > 0] = 0  # aldrig inde i de rigtige skærme
    if w.max() > 0:
        w = cv2.GaussianBlur(w, (0, 0), 3)
        w[skærme > 0] = 0
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(float)
        ring = (cv2.dilate((w > 0.05).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0) & (w < 0.02) & (skærme == 0)
        for c in (1, 2):
            lab[..., c] = lab[..., c] * (1 - w) + np.median(lab[..., c][ring]) * w
        bgr = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
        print(f"genskin neutraliseret: {int((w > 0.05).sum())} px")
    # rester af nøglefarve må aldrig slippe igennem
    for navn in NØGLE:
        h, s, v = cv2.split(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV))
        rest = int(((abs(h.astype(int) - NØGLE[navn][0]) <= 8) & (s > 200) & (v > 200)).sum())
        if rest > 50:
            print(f"ADVARSEL: {rest} px ren {navn} tilbage")
    cv2.imwrite(ud, bgr)
    print("ok", ud, bgr.shape[1], "x", bgr.shape[0])


if __name__ == "__main__":
    main()
