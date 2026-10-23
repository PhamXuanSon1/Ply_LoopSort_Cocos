/**
 * Conveyor: băng chuyền chở hàng giữa các xe (giống game gốc).
 *
 * - Hình dạng băng lấy từ `line` (ConveyorLine: kéo các điểm điều khiển để đổi hình, thứ tự điểm là chiều chạy).
 *   Băng hở (`line.closed = false`) thì hàng chạy tới cuối băng hiện lại ở đầu băng.
 * - Dỡ hàng (`carEvents 'unload'`): mỗi khối là một lưới `gridAlong` x `gridAcross` cục nhỏ (prefab `cubePrefab`, component Cube).
 *   Từng hàng cục phía đuôi xe tách ra (khối co dần lại, `slotShrink`), các cục lần lượt (`releaseInterval`) chạy thành chuỗi:
 *   ra giữa thùng → cửa sau → nảy (kiểu DOJump, `hopPower`) xuống băng tại "cổng" của xe, vừa chạy vừa lộn vòng.
 * - Mỗi khối chọn xe nhận ngay lúc dỡ (`findTarget`): xe gần nhất theo chiều chạy của băng đang có cùng màu trên cùng
 *   và còn chỗ; không xe nào có cùng màu thì mới tới xe rỗng gần nhất. Xe nhận giữ chỗ ngay (`reserve`).
 * - Trên băng cục chạy với tốc độ `speed`; tới cổng xe nhận thì dồn thành đống dày `pileWidth` cục ngang làn,
 *   các cục chen nhau mềm mại (vị trí ngang trượt dần, góc lắc lư). Xe nhận hút từng cục ở đầu đống (`intakeInterval`),
 *   cục chạy thành chuỗi ngược lại: nảy lên cửa sau → dọc thùng → vào ô lưới (xếp từ phía đầu xe ra).
 *   Đủ một hàng cục thì hàng đó liền lại thành khối (`slotPartial`), đủ cả khối thì khối hiện liền (`land(..., true)`).
 * - Chưa xe nào nhận được thì gói cứ chạy vòng và tìm lại liên tục; xe vừa dỡ xong (rỗng) cũng nhận lại được.
 * - Đăng ký nghe `'unload'` nên luồng chuyển hàng trực tiếp tạm thời trong CarController tự tắt.
 */
import { _decorator, Component, instantiate, Node, Prefab, tween, Tween, UITransform, Vec3, v3 } from 'cc';
import { ColorType } from '../Data';
import { CarController, carEvents } from '../Car/CarController';
import { ConveyorLine, generateSmoothPoints } from './ConveyorLine';
import { Cube as CubeView } from './Cube';
const { ccclass, property } = _decorator;

enum Phase {
    Park,    // nằm trong thùng xe nguồn, chờ tới lượt chui ra
    Drop,    // đang chạy từ thùng xe xuống băng
    Belt,    // chạy trên băng / dồn đống ở cổng xe nhận
    Intake,  // đang chạy từ băng vào thùng xe nhận
    Landed,  // đã nằm trong lưới của xe nhận, chờ đủ hàng
}

interface Packet {
    color: ColorType;
    cubes: Cube[];
    target: CarController;
    index: number;
    // Số cục đã được xe nhận hút vào (để chia ô lưới), số cục đã nằm yên theo từng hàng và số hàng đã liền thành khối
    taken: number;
    rowLanded: number[];
    merged: number;
}

interface Job {
    left: number;
    done: () => void;
}

interface Cube {
    node: Node;
    view: CubeView;
    packet: Packet;
    phase: Phase;
    job: Job;
    // Quãng đường trên băng; remain = quãng đường còn lại tới cổng xe nhận (-1 = chưa tính)
    s: number;
    remain: number;
    // Lệch ngang khỏi tim làn hiện tại / độ lệch riêng của cục (để đống trông lộn xộn)
    side: number;
    jitter: number;
    // Đường chạy giữa xe và băng (tọa độ node chứa cục), quãng đã đi và độ dài cộng dồn
    path: Vec3[];
    cum: number[];
    dist: number;
    t: number;
    // Góc: tốc độ lộn vòng khi chạy, góc nghỉ trên băng, pha lắc lư
    spin: number;
    rest: number;
    wobble: number;
    row: number;
    scale: number;
}

@ccclass('Conveyor')
export class Conveyor extends Component {

    // ---------- Đường băng ----------
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, type: ConveyorLine, tooltip: 'Hình dạng băng (ConveyorLine); thứ tự điểm điều khiển là chiều chạy của băng' })
    line: ConveyorLine = null!;
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, tooltip: 'Tốc độ băng (pixel/giây)' })
    speed: number = 1000;
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, min: 1, step: 1, tooltip: 'Đống chờ ở cổng xe nhận dày bao nhiêu cục ngang làn' })
    pileWidth: number = 3;
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, tooltip: 'Khoảng cách giữa các cục trong đống (dọc và ngang làn)' })
    pileGap: number = 38;

    // ---------- Cục hàng ----------
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, type: Prefab, tooltip: 'Prefab cục hàng (5.Prefabs/Gameplay/Cube), có component Cube' })
    cubePrefab: Prefab = null!;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, type: Node, tooltip: 'Node chứa các cục (nên nằm trên Trucks để cục bay vào xe hiện đè lên xe); bỏ trống thì dùng chính Conveyor' })
    cubeLayer: Node = null!;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, min: 1, step: 1, tooltip: 'Số hàng cục dọc theo thân xe trong một khối' })
    gridAlong: number = 2;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, min: 1, step: 1, tooltip: 'Số cục ngang thùng xe trong một hàng' })
    gridAcross: number = 3;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Chiều rộng một cục (pixel)' })
    cubeSize: number = 66;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Độ lệch ngẫu nhiên thêm của mỗi cục trong đống (pixel)' })
    jitter: number = 10;

    // ---------- Nhịp ra / vào ----------
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Thời gian (giây) giữa hai cục liên tiếp chui ra khỏi xe nguồn' })
    releaseInterval: number = 0.055;
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Hàng cục tách khỏi khối sớm hơn cục đầu tiên của hàng chạy ra bao lâu (giây)' })
    rowLead: number = 0.12;
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Thời gian (giây) giữa hai cục liên tiếp được xe nhận hút vào' })
    intakeInterval: number = 0.07;
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Tốc độ (pixel/giây) cục chạy thành chuỗi giữa thùng xe và băng' })
    travelSpeed: number = 1300;
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Độ cao cú nảy (kiểu DOJump) ở đoạn giữa cửa sau thùng xe và băng' })
    hopPower: number = 45;
    @property({ group: { name: 'Nhịp Ra Vào', id: 'timing', displayOrder: 2 }, tooltip: 'Tốc độ lộn vòng tối đa (độ/giây) khi cục đang chạy' })
    spinSpeed: number = 420;

    // Vị trí cổng (quãng đường s trên băng) của từng xe
    ports: Map<CarController, number> = new Map();
    // Lần cuối mỗi xe hút một cục vào (giây, theo `now`)
    lastIntake: Map<CarController, number> = new Map();
    active: Cube[] = [];
    pool: Node[] = [];
    now: number = 0;

    onLoad() {
        if (!this.line) this.line = this.getComponentInChildren(ConveyorLine);
        carEvents.on('unload', this.onUnload, this);
    }

    onDestroy() {
        carEvents.off('unload', this.onUnload, this);
    }

    get layer(): Node {
        return this.cubeLayer || this.node;
    }

    get perUnit(): number {
        return this.gridAlong * this.gridAcross;
    }

    // =========================================================================
    // ĐƯỜNG BĂNG (hình dạng lấy từ ConveyorLine, tọa độ theo node của line)
    // =========================================================================

    wrap(s: number): number {
        return this.line.wrap(s);
    }

    // Điểm trên băng tại quãng đường s, lệch ngang `side` khỏi tim làn, theo tọa độ node chứa cục
    beltPoint(s: number, side: number, out: Vec3): Vec3 {
        let pt = v3(), dir = v3();
        this.line.pointAt(s, pt, dir);
        pt.x += -dir.y * side;
        pt.y += dir.x * side;
        let world = this.line.node.getComponent(UITransform).convertToWorldSpaceAR(pt);
        return this.layer.getComponent(UITransform).convertToNodeSpaceAR(world, out);
    }

    toLayer(world: Vec3): Vec3 {
        return this.layer.getComponent(UITransform).convertToNodeSpaceAR(world);
    }

    // Cổng của xe: điểm trên băng gần mép thùng phía đuôi xe nhất
    portOf(car: CarController): number {
        let s = this.ports.get(car);
        if (s === undefined) {
            let world = car.graphic.exitWorld();
            s = this.line.project(this.line.node.getComponent(UITransform).convertToNodeSpaceAR(world));
            this.ports.set(car, s);
        }
        return s;
    }

    // Ô lưới (a, r) và điểm giữa hàng a của ô hàng `slot`, theo tọa độ node chứa cục
    cell(car: CarController, slot: number, a: number, r: number): Vec3 {
        return this.toLayer(car.graphic.cellWorld(slot, a, r, this.gridAlong, this.gridAcross));
    }

    rowCenter(car: CarController, slot: number, a: number): Vec3 {
        return this.cell(car, slot, a, (this.gridAcross - 1) / 2);
    }

    // =========================================================================
    // CHỌN XE NHẬN
    // =========================================================================

    // Xe gần nhất theo chiều chạy của băng (tính từ quãng đường `from`) đang có cùng màu ở trên cùng và còn chỗ;
    // không xe nào có cùng màu thì mới tới xe rỗng gần nhất. Xe đang dỡ / đã đủ hàng bị loại (canReceive)
    findTarget(color: ColorType, from: number): CarController {
        let cars = CarController.all.filter(c => c.node.activeInHierarchy && c.canReceive(color));
        let same = cars.filter(c => !c.isEmpty());
        let pool = same.length > 0 ? same : cars;
        let best: CarController = null, bestD = Infinity;
        for (let car of pool) {
            let d = this.wrap(this.portOf(car) - from);
            if (d <= 0) d += this.line.length;
            if (d < bestD) { bestD = d; best = car; }
        }
        return best;
    }

    assign(packet: Packet, from: number) {
        let target = this.findTarget(packet.color, from);
        if (!target) return;
        packet.target = target;
        packet.index = target.reserve(packet.color);
        packet.cubes.forEach(c => c.remain = -1);
    }

    // =========================================================================
    // DỠ HÀNG: KHỐI VỠ THÀNH CỤC, TỪNG CỤC CHẠY RA
    // =========================================================================

    onUnload(car: CarController, units: ColorType[], top: number, done?: () => void) {
        let from = this.portOf(car);
        // Đợi xe lùi sát băng rồi mới bắt đầu
        let start = car.movement ? car.movement.backDuration : 0;
        let job: Job = { left: units.length * this.perUnit, done };
        let j = 0;
        units.forEach((color, k) => {
            let packet: Packet = { color, cubes: [], target: null, index: -1, taken: 0, rowLanded: [], merged: 0 };
            CarController.unitsOnBelt++;
            this.assign(packet, from);
            let slot = top - k;
            // Hàng sát đuôi xe tách ra trước
            for (let a = this.gridAlong - 1; a >= 0; a--) {
                let first = start + j * this.releaseInterval;
                let appear = Math.max(0, first - this.rowLead);
                this.scheduleOnce(() => {
                    let row = this.spawnRow(packet, job, car, slot, a);
                    car.graphic.slotShrink(slot, a / this.gridAlong);
                    // Cục giữa hàng (thẳng cửa sau) ra trước, rồi tới hai bên
                    let order = row.slice().sort((p, q) => Math.abs(p.row - (this.gridAcross - 1) / 2) - Math.abs(q.row - (this.gridAcross - 1) / 2));
                    order.forEach((cube, n) => this.scheduleOnce(() => this.release(cube, car, slot, a), first - appear + n * this.releaseInterval));
                }, appear);
                j += this.gridAcross;
            }
        });
    }

    createCube(packet: Packet, job: Job): Cube {
        let node = this.pool.pop() || instantiate(this.cubePrefab);
        node.parent = this.layer;
        node.active = true;
        Tween.stopAllByTarget(node);
        let view = node.getComponent(CubeView);
        view.setColor(packet.color);
        view.setShadow(false);
        // Prefab vẽ ở kích thước gốc của nó; co giãn cho bằng cubeSize
        let scale = this.cubeSize / (node.getComponent(UITransform).width || this.cubeSize);
        node.setScale(scale, scale, 1);
        node.angle = 0;
        let cube: Cube = {
            node, view, packet, job, phase: Phase.Park,
            s: 0, remain: -1, side: 0, jitter: (Math.random() * 2 - 1) * this.jitter,
            path: [], cum: [], dist: 0, t: 0,
            spin: (Math.random() < 0.5 ? -1 : 1) * this.spinSpeed * (0.5 + Math.random() * 0.5),
            rest: (Math.random() * 2 - 1) * 18,
            wobble: Math.random() * Math.PI * 2,
            row: 0, scale,
        };
        packet.cubes.push(cube);
        this.active.push(cube);
        return cube;
    }

    // Hàng a của khối ở ô `slot` vỡ thành `gridAcross` cục nằm đúng chỗ trong thùng xe, nảy nhẹ khi tách ra
    spawnRow(packet: Packet, job: Job, car: CarController, slot: number, a: number): Cube[] {
        let row: Cube[] = [];
        for (let r = 0; r < this.gridAcross; r++) {
            let cube = this.createCube(packet, job);
            cube.row = r;
            cube.node.setPosition(this.cell(car, slot, a, r));
            cube.node.setScale(cube.scale * 0.9, cube.scale * 0.9, 1);
            tween(cube.node)
                .to(0.1, { scale: v3(cube.scale * 1.08, cube.scale * 1.08, 1), angle: (Math.random() * 2 - 1) * 10 }, { easing: 'quadOut' })
                .to(0.08, { scale: v3(cube.scale, cube.scale, 1) }, { easing: 'quadIn' })
                .start();
            row.push(cube);
        }
        return row;
    }

    // Đường chạy mượt qua các điểm; đoạn giữa `hopFrom` và `hopTo` (chỉ số điểm) được nảy lên kiểu DOJump
    buildPath(cube: Cube, points: Vec3[], hopFrom: number) {
        let pts: Vec3[] = [];
        points.forEach((p, i) => {
            pts.push(p.clone());
            if (i == hopFrom && i + 1 < points.length) {
                let q = points[i + 1];
                for (let k = 1; k < 4; k++) {
                    let t = k / 4;
                    let m = v3();
                    Vec3.lerp(m, p, q, t);
                    m.y += this.hopPower * 4 * t * (1 - t);
                    pts.push(m);
                }
            }
        });
        cube.path = generateSmoothPoints(pts, 6, 0, false, 0.5);
        cube.cum = [0];
        for (let i = 1; i < cube.path.length; i++) cube.cum.push(cube.cum[i - 1] + Vec3.distance(cube.path[i - 1], cube.path[i]));
        cube.dist = 0;
        cube.t = 0;
    }

    // Vị trí trên đường chạy tại quãng đường d
    pathPoint(cube: Cube, d: number, out: Vec3): Vec3 {
        let cum = cube.cum, n = cube.path.length;
        if (d >= cum[n - 1]) return out.set(cube.path[n - 1]);
        let i = 1;
        while (i < n - 1 && cum[i] < d) i++;
        let seg = cum[i] - cum[i - 1];
        return Vec3.lerp(out, cube.path[i - 1], cube.path[i], seg > 0 ? (d - cum[i - 1]) / seg : 0);
    }

    // Tiến trên đường chạy: tăng tốc lúc đầu, chậm lại ở cuối; trả về true khi tới nơi
    advancePath(cube: Cube, dt: number, out: Vec3): boolean {
        cube.t += dt;
        let total = cube.cum[cube.cum.length - 1];
        let left = total - cube.dist;
        let speed = this.travelSpeed * Math.min(1, 0.3 + cube.t * 5) * Math.min(1, 0.35 + left / 120);
        cube.dist = Math.min(total, cube.dist + speed * dt);
        this.pathPoint(cube, cube.dist, out);
        cube.node.angle += cube.spin * dt;
        return cube.dist >= total;
    }

    // Cục chạy từ ô trong thùng xe: ra giữa thùng → cửa sau → nảy xuống băng tại cổng của xe
    release(cube: Cube, car: CarController, slot: number, a: number) {
        Tween.stopAllByTarget(cube.node);
        cube.node.setScale(cube.scale, cube.scale, 1);
        cube.phase = Phase.Drop;
        cube.view.setShadow(true);
        cube.s = this.portOf(car);
        cube.side = cube.jitter;
        let exit = this.toLayer(car.graphic.exitWorld());
        let belt = this.beltPoint(cube.s, cube.side, v3());
        this.buildPath(cube, [cube.node.position.clone(), this.rowCenter(car, slot, a), exit, belt], 2);
    }

    // =========================================================================
    // CHẠY TRÊN BĂNG, DỒN ĐỐNG Ở CỔNG, HÚT VÀO XE NHẬN
    // =========================================================================

    update(dt: number) {
        if (this.active.length == 0) return;
        this.now += dt;
        let step = this.speed * dt;
        let ease = 1 - Math.exp(-10 * dt);
        let pos = v3();
        let queues: Map<CarController, Cube[]> = new Map();

        for (let cube of this.active.slice()) {
            let packet = cube.packet;
            if (cube.phase == Phase.Drop) {
                if (this.advancePath(cube, dt, pos)) this.onBelt(cube);
                cube.node.setPosition(pos);
                continue;
            }
            if (cube.phase == Phase.Intake) {
                let arrived = this.advancePath(cube, dt, pos);
                cube.node.setPosition(pos);
                if (arrived) this.landed(cube);
                continue;
            }
            if (cube.phase != Phase.Belt) continue;
            // Góc dần về góc nghỉ, lắc lư nhẹ như đang bị băng xóc
            let target = cube.rest + Math.sin(this.now * 9 + cube.wobble) * 5;
            cube.node.angle += (target - cube.node.angle) * ease;
            // Gói chưa có xe nhận: tìm lại mỗi khung hình (có thể có xe vừa rảnh)
            if (!packet.target) this.assign(packet, cube.s);
            if (!packet.target) {
                cube.s = this.wrap(cube.s + step);
                cube.side += (cube.jitter - cube.side) * ease;
                continue;
            }
            let port = this.portOf(packet.target);
            if (cube.remain < 0) cube.remain = this.wrap(port - cube.s);
            let q = queues.get(packet.target);
            if (!q) queues.set(packet.target, q = []);
            q.push(cube);
        }

        // Dồn đống ở cổng: cục thứ i đứng ở hàng i / pileWidth (cách cổng mỗi hàng pileGap), cột i % pileWidth ngang làn;
        // cục tiến tới chỗ của mình với tốc độ băng, vị trí ngang trượt dần nên cả đống chen nhau mềm mại
        queues.forEach((q, car) => {
            q.sort((a, b) => a.remain - b.remain);
            let port = this.portOf(car);
            q.forEach((cube, i) => {
                let row = Math.floor(i / this.pileWidth), col = i % this.pileWidth;
                let want = row * this.pileGap;
                cube.remain = Math.max(want, cube.remain - step);
                cube.s = this.wrap(port - cube.remain);
                let side = (col - (this.pileWidth - 1) / 2) * this.pileGap + cube.jitter;
                cube.side += (side - cube.side) * ease;
            });
            let head = q[0];
            let last = this.lastIntake.has(car) ? this.lastIntake.get(car) : -Infinity;
            if (head.remain <= this.pileGap * 0.5 && this.now - last >= this.intakeInterval) {
                this.lastIntake.set(car, this.now);
                this.intake(head);
            }
        });

        for (let cube of this.active) {
            if (cube.phase != Phase.Belt) continue;
            cube.node.setPosition(this.beltPoint(cube.s, cube.side, pos));
        }
    }

    // Cục vừa rơi xuống băng: báo cho xe nguồn khi cục cuối đã ra hết
    onBelt(cube: Cube) {
        cube.phase = Phase.Belt;
        cube.remain = -1;
        let job = cube.job;
        if (job && --job.left == 0 && job.done) job.done();
        cube.job = null;
    }

    // Xe nhận hút một cục: nảy lên cửa sau → chạy dọc thùng → vào ô lưới kế tiếp (xếp từ phía đầu xe ra)
    intake(cube: Cube) {
        let packet = cube.packet;
        let car = packet.target;
        let c = packet.taken++;
        let a = Math.floor(c / this.gridAcross), r = c % this.gridAcross;
        cube.row = a;
        cube.phase = Phase.Intake;
        cube.spin = (Math.random() < 0.5 ? -1 : 1) * this.spinSpeed * (0.4 + Math.random() * 0.4);
        let exit = this.toLayer(car.graphic.exitWorld());
        let to = this.cell(car, packet.index, a, r);
        this.buildPath(cube, [cube.node.position.clone(), exit, this.rowCenter(car, packet.index, a), to], 0);
    }

    // Cục vào tới ô: nảy nhẹ, thẳng lại; đủ một hàng thì hàng đó liền thành khối, đủ cả khối thì khối hiện liền
    landed(cube: Cube) {
        cube.phase = Phase.Landed;
        cube.view.setShadow(false);
        let s = cube.scale;
        cube.node.setScale(s * 1.12, s * 0.9, 1);
        tween(cube.node)
            .to(0.1, { scale: v3(s, s, 1), angle: 0 }, { easing: 'backOut' })
            .start();
        let packet = cube.packet;
        packet.rowLanded[cube.row] = (packet.rowLanded[cube.row] || 0) + 1;
        while (packet.merged < this.gridAlong && packet.rowLanded[packet.merged] == this.gridAcross) {
            let row = packet.merged++;
            // Đợi cục cuối của hàng nảy xong rồi mới liền khối
            this.scheduleOnce(() => this.mergeRow(packet, row), 0.08);
        }
    }

    mergeRow(packet: Packet, row: number) {
        packet.cubes.filter(c => c.phase == Phase.Landed && c.row == row).forEach(c => this.recycle(c));
        let car = packet.target;
        if (row + 1 < this.gridAlong) {
            car.graphic.slotPartial(packet.index, (row + 1) / this.gridAlong);
            return;
        }
        CarController.unitsOnBelt--;
        car.land(packet.index, packet.color, true);
    }

    recycle(cube: Cube) {
        let i = this.active.indexOf(cube);
        if (i >= 0) this.active.splice(i, 1);
        Tween.stopAllByTarget(cube.node);
        cube.node.active = false;
        this.pool.push(cube.node);
    }
}
