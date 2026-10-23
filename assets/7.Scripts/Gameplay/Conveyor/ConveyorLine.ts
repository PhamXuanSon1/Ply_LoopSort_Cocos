/**
 * ConveyorLine: hình dạng băng chuyền, vẽ bằng Graphics theo các điểm điều khiển (dựa trên Line2D).
 *
 * - Điểm điều khiển là các node con của `Points` (kéo thả trong Scene để đổi hình băng, thêm/bớt node để thêm/bớt điểm).
 *   Thứ tự node = chiều chạy của băng. Đường đi qua mọi điểm, được làm mượt bằng Catmull-Rom (`smoothStep`, `tension`).
 * - `closed`: băng vòng kín (điểm cuối nối về điểm đầu). Băng hở thì hàng chạy tới cuối sẽ hiện lại ở đầu (như cổng ở game gốc).
 * - Vẽ 3 lớp Graphics con: `Shadow` (bóng đổ), `Rim` (gờ, rộng `laneWidth`), `Face` (mặt băng, hẹp hơn 2*`rimWidth`),
 *   cộng mũi tên chỉ chiều chạy (`Arrows`, cách đều `arrowSpacing`), khi chơi trôi chậm theo chiều băng (`arrowSpeed`)
 *   và mờ dần ở hai đầu băng hở (`arrowFade`). Mũi tên được tạo lại mỗi lần vẽ và không lưu vào scene.
 * - Tự vẽ lại trong editor khi điểm hoặc thông số đổi. Conveyor dùng `length`, `pointAt(s)`, `project(p)` để chạy hàng trên băng
 *   (tọa độ theo node chứa ConveyorLine).
 */
import { _decorator, CCInteger, CCObject, Color, Component, Graphics, Node, Sprite, SpriteFrame, UITransform, v3, Vec3 } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('ConveyorLine')
@executeInEditMode
export class ConveyorLine extends Component {

    // ---------- Hình dạng ----------
    @property({ group: { name: 'Hình Dạng', id: 'shape', displayOrder: 0 }, tooltip: 'Băng vòng kín (điểm cuối nối về điểm đầu); tắt thì hàng chạy tới cuối băng hiện lại ở đầu băng' })
    closed: boolean = true;
    @property({ group: { name: 'Hình Dạng', id: 'shape', displayOrder: 0 }, type: CCInteger, min: 1, tooltip: 'Số điểm nội suy giữa hai điểm điều khiển (càng lớn càng mượt)' })
    smoothStep: number = 10;
    @property({ group: { name: 'Hình Dạng', id: 'shape', displayOrder: 0 }, range: [-1, 1, 0.05], slide: true, tooltip: 'Độ căng Catmull-Rom: 0 = mượt, 1 = gãy góc tại điểm điều khiển' })
    tension: number = 0;
    @property({ group: { name: 'Hình Dạng', id: 'shape', displayOrder: 0 }, range: [0, 1, 0.05], slide: true, tooltip: 'Kiểu nội suy: 0 = uniform (dễ vọt lố thành "tai" ở góc), 0.5 = centripetal (khuyên dùng), 1 = chordal' })
    alpha: number = 0.5;

    // ---------- Hiển thị ----------
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Bề rộng làn băng (cả gờ)' })
    laneWidth: number = 200;
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Bề dày gờ hai bên làn' })
    rimWidth: number = 10;
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Màu mặt băng' })
    faceColor: Color = new Color(45, 41, 112, 255);
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Màu gờ băng' })
    rimColor: Color = new Color(107, 86, 198, 255);
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Màu bóng đổ dưới băng' })
    shadowColor: Color = new Color(10, 8, 30, 110);
    @property({ group: { name: 'Hiển Thị', id: 'look', displayOrder: 1 }, tooltip: 'Độ lệch bóng đổ xuống dưới (0 = không có bóng)' })
    shadowOffset: number = 14;

    // ---------- Mũi tên ----------
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, type: SpriteFrame, tooltip: 'Ảnh mũi tên (đầu nhọn hướng lên trên); bỏ trống thì không vẽ mũi tên' })
    arrowFrame: SpriteFrame = null!;
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Khoảng cách giữa hai mũi tên dọc theo băng' })
    arrowSpacing: number = 130;
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Kích thước mũi tên (rộng x cao)' })
    arrowWidth: number = 38;
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Chiều cao mũi tên' })
    arrowHeight: number = 32;
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Màu mũi tên' })
    arrowColor: Color = new Color(120, 112, 210, 255);
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Tốc độ mũi tên trôi theo chiều băng (pixel/giây), như game gốc trôi chậm hơn hàng nhiều lần; 0 = đứng yên' })
    arrowSpeed: number = 150;
    @property({ group: { name: 'Mũi Tên', id: 'arrow', displayOrder: 2 }, tooltip: 'Băng hở: mũi tên mờ dần trong đoạn này khi tới gần hai đầu băng' })
    arrowFade: number = 120;

    // Đường đã làm mượt (tọa độ node này), độ dài cộng dồn tới từng điểm và tổng độ dài
    poses: Vec3[] = [];
    cum: number[] = [];
    length: number = 0;
    snapshot: string = '';
    // Mũi tên đang hiện và độ trôi hiện tại của chúng dọc theo băng
    arrows: Sprite[] = [];
    arrowOffset: number = 0;

    onLoad() {
        this.rebuild();
    }

    // Trong editor: vẽ lại khi kéo điểm hoặc đổi thông số. Khi chơi: mũi tên trôi theo chiều băng
    update(dt: number) {
        if (EDITOR_NOT_IN_PREVIEW) {
            if (this.makeKey() != this.snapshot) this.rebuild();
            return;
        }
        if (this.arrowSpeed != 0 && this.arrows.length > 0) {
            this.arrowOffset += this.arrowSpeed * dt;
            this.placeArrows();
        }
    }

    get pointsRoot(): Node {
        let root = this.node.getChildByName('Points');
        if (!root) {
            // Mặc định một vòng chữ nhật để có cái mà kéo
            root = this.createChild('Points');
            [[-300, -300], [-300, 300], [300, 300], [300, -300]].forEach(([x, y], i) => {
                let p = new Node('' + i);
                p.layer = root.layer;
                p.parent = root;
                p.addComponent(UITransform);
                p.setPosition(x, y, 0);
            });
        }
        return root;
    }

    createChild(name: string, flags: number = 0): Node {
        let node = new Node(name);
        node._objFlags |= flags;
        node.layer = this.node.layer;
        node.parent = this.node;
        node.addComponent(UITransform);
        return node;
    }

    // Điểm điều khiển theo tọa độ node này
    controlPoints(): Vec3[] {
        return this.pointsRoot.children.filter(p => p.active || EDITOR_NOT_IN_PREVIEW)
            .map(p => this.node.inverseTransformPoint(v3(), p.worldPosition));
    }

    makeKey(): string {
        let pts = this.controlPoints().map(p => [Math.round(p.x * 10), Math.round(p.y * 10)]);
        return JSON.stringify([pts, this.closed, this.smoothStep, this.tension, this.alpha, this.laneWidth, this.rimWidth,
            this.faceColor, this.rimColor, this.shadowColor, this.shadowOffset,
            this.arrowFrame?.uuid, this.arrowSpacing, this.arrowWidth, this.arrowHeight, this.arrowColor]);
    }

    // =========================================================================
    // DỰNG ĐƯỜNG & VẼ
    // =========================================================================

    rebuild() {
        this.snapshot = this.makeKey();
        // Inspector có thể gửi giá trị tạm (0, rỗng, âm) khi đang gõ smoothStep → ép tối thiểu 1
        let step = Math.max(1, Math.floor(this.smoothStep) || 1);
        this.poses = generateSmoothPoints(this.controlPoints(), step, this.tension, this.closed, this.alpha);
        this.cum = [0];
        for (let i = 1; i < this.poses.length; i++) {
            this.cum.push(this.cum[i - 1] + Vec3.distance(this.poses[i - 1], this.poses[i]));
        }
        this.length = this.cum[this.cum.length - 1] || 0;
        this.draw();
        this.buildArrows();
    }

    layerGraphics(name: string, index: number): Graphics {
        let node = this.node.getChildByName(name) || this.createChild(name);
        node.setSiblingIndex(index);
        return node.getComponent(Graphics) || node.addComponent(Graphics);
    }

    draw() {
        let shadow = this.layerGraphics('Shadow', 0);
        let rim = this.layerGraphics('Rim', 1);
        let face = this.layerGraphics('Face', 2);
        shadow.node.setPosition(0, -this.shadowOffset, 0);
        rim.node.setPosition(0, 0, 0);
        face.node.setPosition(0, 0, 0);
        // Graphics sinh rất nhiều đỉnh cho mỗi điểm (round join x lineWidth lớn) — chỉ giới hạn số điểm VẼ,
        // poses (dùng để chạy hàng) vẫn giữ đủ độ mịn
        let pts = sampleEvenly(this.poses, 200);
        let layers: [Graphics, Color, number][] = [
            [shadow, this.shadowColor, this.shadowOffset > 0 ? this.laneWidth : 0],
            [rim, this.rimColor, this.laneWidth],
            [face, this.faceColor, Math.max(1, this.laneWidth - 2 * this.rimWidth)],
        ];
        layers.forEach(([g, color, width]) => {
            g.clear();
            if (pts.length < 2 || width <= 0) return;
            g.lineWidth = width;
            g.strokeColor = color;
            g.lineJoin = Graphics.LineJoin.ROUND;
            g.lineCap = this.closed ? Graphics.LineCap.BUTT : Graphics.LineCap.ROUND;
            g.moveTo(pts[0].x, pts[0].y);
            // Băng kín: điểm cuối trùng điểm đầu, dùng close() để chỗ nối được bo như các khớp khác
            let last = this.closed ? pts.length - 1 : pts.length;
            for (let i = 1; i < last; i++) g.lineTo(pts[i].x, pts[i].y);
            if (this.closed) g.close();
            g.stroke();
        });
    }

    // Mũi tên cách đều dọc theo băng, xoay theo chiều chạy; tạo lại mỗi lần, không lưu vào scene
    buildArrows() {
        let root = this.node.getChildByName('Arrows') || this.createChild('Arrows');
        root.setSiblingIndex(3);
        root.removeAllChildren();
        this.arrows = [];
        if (!this.arrowFrame || this.arrowSpacing <= 0 || this.length <= 0) return;
        let count = Math.max(1, Math.round(this.length / this.arrowSpacing));
        for (let i = 0; i < count; i++) {
            let node = new Node('Arrow' + i);
            node._objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
            node.layer = root.layer;
            node.parent = root;
            node.addComponent(UITransform).setContentSize(this.arrowWidth, this.arrowHeight);
            let sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.arrowFrame;
            sprite.color = this.arrowColor;
            this.arrows.push(sprite);
        }
        this.placeArrows();
    }

    // Đặt mũi tên cách đều dọc băng, lệch theo arrowOffset; băng hở thì mũi tên mờ dần ở hai đầu
    placeArrows() {
        let count = this.arrows.length;
        if (count == 0 || this.length <= 0) return;
        let gap = this.length / count;
        let pos = v3(), dir = v3();
        let color = new Color();
        this.arrows.forEach((sprite, i) => {
            let s = this.wrap((i + 0.5) * gap + this.arrowOffset);
            this.pointAt(s, pos, dir);
            sprite.node.setPosition(pos);
            sprite.node.angle = Math.atan2(dir.y, dir.x) * 180 / Math.PI - 90;
            let alpha = 1;
            if (!this.closed && this.arrowFade > 0) {
                alpha = Math.min(1, s / this.arrowFade, (this.length - s) / this.arrowFade);
            }
            color.set(this.arrowColor);
            color.a = Math.round(this.arrowColor.a * Math.max(0, alpha));
            sprite.color = color;
        });
    }

    // =========================================================================
    // TRUY VẤN ĐƯỜNG (Conveyor dùng)
    // =========================================================================

    wrap(s: number): number {
        return this.length > 0 ? ((s % this.length) + this.length) % this.length : 0;
    }

    // Điểm tại quãng đường s tính từ điểm đầu (theo chiều chạy), kèm hướng chạy đã chuẩn hoá
    pointAt(s: number, out: Vec3, dir: Vec3) {
        let n = this.poses.length;
        if (n < 2) {
            out.set(n ? this.poses[0] : Vec3.ZERO);
            dir.set(1, 0, 0);
            return;
        }
        s = this.wrap(s);
        // Tìm đoạn chứa s bằng chia đôi trên độ dài cộng dồn
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            let mid = (lo + hi) >> 1;
            if (this.cum[mid] <= s) lo = mid; else hi = mid;
        }
        let a = this.poses[lo], b = this.poses[hi];
        let seg = this.cum[hi] - this.cum[lo];
        Vec3.lerp(out, a, b, seg > 0 ? (s - this.cum[lo]) / seg : 0);
        Vec3.subtract(dir, b, a);
        if (dir.lengthSqr() > 0) dir.normalize(); else dir.set(1, 0, 0);
    }

    // Quãng đường s của điểm trên băng gần p nhất (p theo tọa độ node này)
    project(p: Vec3): number {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < this.poses.length - 1; i++) {
            let a = this.poses[i], b = this.poses[i + 1];
            let abx = b.x - a.x, aby = b.y - a.y;
            let len2 = abx * abx + aby * aby;
            let t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
            let dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y;
            let d = dx * dx + dy * dy;
            if (d < bestD) {
                bestD = d;
                best = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t;
            }
        }
        return best;
    }
}

// Lấy đều `max` phần tử, luôn giữ phần tử đầu và cuối (path khép kín không bị hở ở mốc nối)
function sampleEvenly<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const result: T[] = [];
    for (let i = 0; i < max; i++) {
        result.push(arr[Math.round(i * (arr.length - 1) / (max - 1))]);
    }
    return result;
}

// Catmull-Rom có tension và kiểu tham số hoá alpha (0 = uniform như Line2D, 0.5 = centripetal, 1 = chordal).
// Uniform vọt lố thành "tai" khi các điểm cách nhau không đều (vd. góc bo giữa hai cạnh dài); centripetal thì không.
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number, tension: number, alpha: number = 0): Vec3 {
    const t2 = t * t;
    const t3 = t2 * t;

    // tính hệ số (m1, m2) có tension
    let m1: Vec3, m2: Vec3;
    if (alpha <= 0) {
        m1 = Vec3.subtract(v3(), p2, p0).multiplyScalar((1 - tension) * 0.5);
        m2 = Vec3.subtract(v3(), p3, p1).multiplyScalar((1 - tension) * 0.5);
    } else {
        // Khoảng tham số giữa hai điểm = khoảng cách^alpha (điểm trùng nhau ở đầu băng hở thì coi như 1)
        const knot = (a: Vec3, b: Vec3) => Math.pow(Vec3.distance(a, b), alpha) || 1;
        const d0 = knot(p0, p1), d1 = knot(p1, p2), d2 = knot(p2, p3);
        const k = 1 - tension;
        const tangent = (a: Vec3, b: Vec3, c: Vec3, da: number, db: number) => {
            // d1 * ((b-a)/da - (c-a)/(da+db) + (c-b)/db)
            const out = Vec3.subtract(v3(), b, a).multiplyScalar(1 / da);
            out.subtract(Vec3.subtract(v3(), c, a).multiplyScalar(1 / (da + db)));
            out.add(Vec3.subtract(v3(), c, b).multiplyScalar(1 / db));
            return out.multiplyScalar(d1 * k);
        };
        m1 = tangent(p0, p1, p2, d0, d1);
        m2 = tangent(p1, p2, p3, d1, d2);
    }

    const a = (2 * t3 - 3 * t2 + 1);
    const b = (t3 - 2 * t2 + t);
    const c = (-2 * t3 + 3 * t2);
    const d = (t3 - t2);

    const result = new Vec3();
    result.x = a * p1.x + b * m1.x + c * p2.x + d * m2.x;
    result.y = a * p1.y + b * m1.y + c * p2.y + d * m2.y;
    result.z = a * p1.z + b * m1.z + c * p2.z + d * m2.z;
    return result;
}

// Đường mượt đi qua các điểm điều khiển; closed thì nối vòng (điểm cuối của kết quả trùng điểm đầu)
export function generateSmoothPoints(points: Vec3[], nSamples: number = 10, tension: number = 0, closed: boolean = false, alpha: number = 0): Vec3[] {
    const n = points.length;
    if (n < 2) return points.map(p => p.clone());

    const result: Vec3[] = [];
    const at = (i: number) => closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))];
    const segments = closed ? n : n - 1;

    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < nSamples; j++) {
            result.push(catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), j / nSamples, tension, alpha));
        }
    }

    // luôn thêm điểm cuối (băng kín: quay về điểm đầu)
    result.push((closed ? points[0] : points[n - 1]).clone());

    return result;
}
