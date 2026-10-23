/**
 * CarMovement: chuyển động của xe.
 *
 * - `shake()`: rung khi chạm vào xe không đổ hàng được.
 * - `nudge()`: nhích nhẹ về phía băng khi đổ hàng.
 * - `driveAway()`: chạy ra khỏi màn hình về phía đầu xe (hiện không dùng: xe hoàn thành thì đứng yên).
 */
import { _decorator, Component, Tween, tween, v3, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CarMovement')
export class CarMovement extends Component {

    // -1 = cab points left (rear faces the belt on the right), 1 = cab points right
    @property
    facing: number = -1;
    @property
    driveDistance: number = 1600;
    @property
    driveDuration: number = 0.7;

    origin: Vec3 = null!;

    onLoad() {
        this.origin = this.node.position.clone();
    }

    // tap on a car that cannot unload
    shake() {
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.origin);
        let o = this.origin;
        tween(this.node)
            .to(0.05, { position: v3(o.x - 14, o.y, o.z) })
            .to(0.05, { position: v3(o.x + 14, o.y, o.z) })
            .to(0.05, { position: v3(o.x - 8, o.y, o.z) })
            .to(0.05, { position: v3(o.x, o.y, o.z) })
            .start();
    }

    // small push toward the belt while unloading
    nudge() {
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.origin);
        let o = this.origin;
        tween(this.node)
            .to(0.08, { position: v3(o.x - this.facing * 18, o.y, o.z) }, { easing: 'quadOut' })
            .to(0.15, { position: o }, { easing: 'quadIn' })
            .start();
    }

    // drive off screen through the cab side, then hide
    driveAway(done?: () => void) {
        Tween.stopAllByTarget(this.node);
        let o = this.origin;
        tween(this.node)
            .delay(0.35)
            .to(0.12, { position: v3(o.x - this.facing * 20, o.y, o.z) }, { easing: 'quadOut' })
            .to(this.driveDuration, { position: v3(o.x + this.facing * this.driveDistance, o.y, o.z) }, { easing: 'quadIn' })
            .call(() => {
                this.node.active = false;
                done && done();
            })
            .start();
    }
}
