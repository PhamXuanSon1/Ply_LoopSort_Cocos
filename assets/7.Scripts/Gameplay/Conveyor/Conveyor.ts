/**
 * Conveyor: băng chuyền vòng kín chở hàng giữa các xe (giống game gốc).
 *
 * - Hình dạng băng lấy từ `line` (ConveyorLine: kéo các điểm điều khiển để đổi hình, thứ tự điểm là chiều chạy).
 *   Băng hở (`line.closed = false`) thì hàng chạy tới cuối băng hiện lại ở đầu băng.
 * - Khi xe dỡ hàng (`carEvents 'unload'`), mỗi khối vỡ thành `cubesPerUnit` cục nhỏ (ảnh `Cubes/cube_<Màu>`)
 *   bay từ ô hàng xuống băng tại "cổng" của xe (điểm trên băng gần đuôi xe nhất), rồi chạy theo băng.
 * - Một khối = một gói cục. Lúc dỡ, mỗi khối chọn xe nhận (`findTarget`): xe gần nhất theo chiều chạy của băng đang có
 *   cùng màu trên cùng và còn chỗ; chỉ khi không xe nào có cùng màu mới tới xe rỗng gần nhất. Xe nhận giữ chỗ ngay (`reserve`),
 *   các cục chạy qua những xe khác và chỉ nhảy vào khi qua cổng của xe nhận; cục cuối vào thì khối hiện ra (`land`).
 * - Chưa xe nào nhận được thì gói cứ chạy vòng và tìm lại liên tục; xe vừa dỡ xong (rỗng) cũng nhận lại được.
 * - Đăng ký nghe `'unload'` nên luồng chuyển hàng trực tiếp tạm thời trong CarController tự tắt.
 */
import { _decorator, Component, Node, Sprite, UITransform, Vec3, v3, tween } from 'cc';
import { ColorType } from '../Data';
import { CarController, carEvents } from '../Car/CarController';
import { CargoUnitFrame } from '../Car/CarSkin';
import { ConveyorLine } from './ConveyorLine';
const { ccclass, property } = _decorator;

interface Packet {
    color: ColorType;
    cubes: Cube[];
    target: CarController;
    index: number;
    landed: number;
}

interface Cube {
    node: Node;
    packet: Packet;
    s: number;
    side: number;
    // 0 = đang bay từ xe xuống băng, 1 = chạy trên băng, 2 = đang nhảy vào xe nhận
    phase: number;
    t: number;
    from: Vec3;
}

@ccclass('Conveyor')
export class Conveyor extends Component {

    // ---------- Đường băng ----------
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, type: ConveyorLine, tooltip: 'Hình dạng băng (ConveyorLine); thứ tự điểm điều khiển là chiều chạy của băng' })
    line: ConveyorLine = null!;
    @property({ group: { name: 'Đường Băng', id: 'path', displayOrder: 0 }, tooltip: 'Tốc độ băng (pixel/giây)' })
    speed: number = 900;

    // ---------- Cục hàng ----------
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, type: [CargoUnitFrame], tooltip: 'Ảnh cục nhỏ theo từng màu (Cubes/cube_<Màu>)' })
    cubes: CargoUnitFrame[] = [];
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, type: Node, tooltip: 'Node chứa các cục (nên nằm trên Trucks để cục bay vào xe hiện đè lên xe); bỏ trống thì dùng chính Conveyor' })
    cubeLayer: Node = null!;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, min: 1, step: 1, tooltip: 'Số cục nhỏ tạo thành một khối hàng' })
    cubesPerUnit: number = 8;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Chiều rộng một cục (pixel)' })
    cubeSize: number = 60;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Độ lệch ngang tối đa so với tim làn, để các cục nằm lộn xộn như một đống' })
    laneSpread: number = 40;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Thời gian (giây) cục bay từ xe xuống băng' })
    enterDuration: number = 0.25;
    @property({ group: { name: 'Cục Hàng', id: 'cube', displayOrder: 1 }, tooltip: 'Thời gian (giây) cục nhảy từ băng vào xe nhận' })
    leaveDuration: number = 0.22;

    // Vị trí cổng (quãng đường s trên băng) của từng xe
    ports: Map<CarController, number> = new Map();
    flying: Cube[] = [];
    pool: Node[] = [];

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

    // =========================================================================
    // ĐƯỜNG BĂNG (hình dạng lấy từ ConveyorLine, tọa độ theo node của line)
    // =========================================================================

    wrap(s: number): number {
        return this.line.wrap(s);
    }

    pointAt(s: number, out: Vec3, dir: Vec3) {
        this.line.pointAt(s, out, dir);
    }

    // Quãng đường s của điểm trên băng gần điểm thế giới `world` nhất
    projectWorld(world: Vec3): number {
        return this.line.project(this.line.node.getComponent(UITransform).convertToNodeSpaceAR(world));
    }

    // Chuyển điểm từ tọa độ node của line sang tọa độ node chứa cục
    toLayer(p: Vec3, out: Vec3): Vec3 {
        let world = this.line.node.getComponent(UITransform).convertToWorldSpaceAR(p);
        return this.layer.getComponent(UITransform).convertToNodeSpaceAR(world, out);
    }

    // Cổng của xe: điểm trên băng gần mép thùng phía đuôi xe nhất
    portOf(car: CarController): number {
        let s = this.ports.get(car);
        if (s === undefined) {
            let g = car.graphic;
            let rear = v3(g.bedRearX * g.rearDir, g.bedY, 0);
            let world = g.body.node.getComponent(UITransform).convertToWorldSpaceAR(rear);
            s = this.projectWorld(world);
            this.ports.set(car, s);
        }
        return s;
    }

    // =========================================================================
    // DỠ HÀNG XUỐNG BĂNG
    // =========================================================================

    onUnload(car: CarController, units: ColorType[], top: number) {
        let interval = car.unloadInterval;
        let from = this.portOf(car);
        units.forEach((color, k) => {
            let packet: Packet = { color, cubes: [], target: null, index: -1, landed: 0 };
            CarController.unitsOnBelt++;
            // Chọn xe nhận ngay lúc dỡ (theo thứ tự khối), giữ chỗ luôn để khối sau tính cả khối trước
            this.assign(packet, from);
            // Các cục của khối k rơi ra trong lúc khối đó trượt ra khỏi thùng (slotOut chạy theo cùng nhịp)
            let start = k * interval + car.graphic.slotAnimDuration * 0.3;
            for (let j = 0; j < this.cubesPerUnit; j++) {
                this.scheduleOnce(() => this.spawn(packet, car, top - k), start + j * interval * 0.8 / this.cubesPerUnit);
            }
        });
    }

    getCubeFrame(color: ColorType) {
        let c = this.cubes.find(u => u.color == color);
        return c ? c.frame : null;
    }

    spawn(packet: Packet, car: CarController, slot: number) {
        let node = this.pool.pop();
        if (!node) {
            node = new Node('Cube');
            node.layer = this.layer.layer;
            node.addComponent(UITransform);
            let s = node.addComponent(Sprite);
            s.sizeMode = Sprite.SizeMode.CUSTOM;
            s.trim = false;
        }
        node.parent = this.layer;
        node.active = true;
        let sprite = node.getComponent(Sprite);
        sprite.spriteFrame = this.getCubeFrame(packet.color);
        let rect = sprite.spriteFrame?.originalSize;
        let ratio = rect ? rect.height / rect.width : 1;
        node.getComponent(UITransform).setContentSize(this.cubeSize, this.cubeSize * ratio);
        node.setScale(1, 1, 1);
        node.angle = (Math.random() * 2 - 1) * 15;

        let from = v3();
        let slotNode = car.graphic.slots[slot]?.node || car.node;
        this.layer.getComponent(UITransform).convertToNodeSpaceAR(slotNode.worldPosition, from);
        from.x += (Math.random() * 2 - 1) * 20;
        from.y += (Math.random() * 2 - 1) * 20;
        node.setPosition(from);

        let cube: Cube = {
            node, packet, from,
            s: this.portOf(car),
            side: (Math.random() * 2 - 1) * this.laneSpread,
            phase: 0,
            t: 0,
        };
        packet.cubes.push(cube);
        this.flying.push(cube);
    }

    // =========================================================================
    // CHẠY TRÊN BĂNG & VÀO XE NHẬN
    // =========================================================================

    update(dt: number) {
        if (this.flying.length == 0) return;
        let pt = v3(), dir = v3(), pos = v3();
        let step = this.speed * dt;
        for (let cube of this.flying.slice()) {
            let prev = cube.s;
            cube.s += step;
            this.pointAt(cube.s, pt, dir);
            // Lệch sang hai bên tim làn (pháp tuyến của hướng chạy)
            pt.x += -dir.y * cube.side;
            pt.y += dir.x * cube.side;
            this.toLayer(pt, pos);
            if (cube.phase == 0) {
                cube.t += dt;
                let k = Math.min(1, cube.t / this.enterDuration);
                let e = 1 - (1 - k) * (1 - k);
                Vec3.lerp(pos, cube.from, pos, e);
                if (k >= 1) cube.phase = 1;
            }
            cube.node.setPosition(pos);
            this.checkPorts(cube, prev, step);
        }
    }

    // Xe nhận của một khối: xe gần nhất theo chiều chạy của băng (tính từ quãng đường `from`) đang có cùng màu
    // ở trên cùng và còn chỗ; không xe nào có cùng màu thì mới tới xe rỗng gần nhất. Xe đang dỡ / đã đủ hàng bị loại.
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
    }

    // Cục vừa đi qua cổng của xe nào: chỉ nhảy vào đúng xe nhận của gói. Gói chưa có xe nhận (lúc dỡ chưa xe nào nhận được)
    // thì cục dẫn đầu tìm lại mỗi khung hình, có xe nhận rồi các cục còn lại đi theo
    checkPorts(cube: Cube, prev: number, step: number) {
        let packet = cube.packet;
        if (!packet.target && cube == packet.cubes[0]) this.assign(packet, prev);
        if (!packet.target) return;
        let d = this.wrap(this.portOf(packet.target) - prev);
        if (d > 0 && d <= step) this.leave(cube);
    }

    leave(cube: Cube) {
        cube.phase = 2;
        let i = this.flying.indexOf(cube);
        if (i >= 0) this.flying.splice(i, 1);
        let packet = cube.packet;
        let slotNode = packet.target.graphic.slots[packet.index]?.node || packet.target.node;
        let to = this.layer.getComponent(UITransform).convertToNodeSpaceAR(slotNode.worldPosition);
        to.x += (Math.random() * 2 - 1) * 15;
        to.y += (Math.random() * 2 - 1) * 15;
        tween(cube.node)
            .to(this.leaveDuration, { position: to, scale: v3(0.6, 0.6, 1) }, { easing: 'quadIn' })
            .call(() => {
                this.recycle(cube.node);
                packet.landed++;
                if (packet.landed == this.cubesPerUnit) {
                    CarController.unitsOnBelt--;
                    packet.target.land(packet.index, packet.color);
                }
            })
            .start();
    }

    recycle(node: Node) {
        node.active = false;
        this.pool.push(node);
    }
}
