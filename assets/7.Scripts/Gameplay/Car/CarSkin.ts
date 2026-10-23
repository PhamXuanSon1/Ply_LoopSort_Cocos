/**
 * CarSkin: kho ảnh của xe (ảnh xe rỗng, xe đóng nắp, ảnh 1 khối hàng cho từng màu), gắn trên prefab `Truck`.
 *
 * - `units`: mỗi màu một ảnh khối (`LoopSort/CargoUnits/Left/<Màu>.png`); CarGraphic tự kéo giãn theo số ô.
 * - Nếu không có trên xe, CarGraphic tìm CarSkin ở node cha (dùng chung cho nhiều xe).
 * - Cocos chỉ cho mỗi file một component, nên lớp này phải nằm ở file riêng.
 */
import { _decorator, Component, Enum, SpriteFrame, ccenum } from 'cc';
import { ColorType } from '../Data';
const { ccclass, property } = _decorator;

ccenum(ColorType);

// One cargo unit as it sits in the truck bed (already clipped by the truck side wall)
@ccclass('CargoUnitFrame')
export class CargoUnitFrame {
    @property({ type: Enum(ColorType) })
    color: ColorType = ColorType.Red;
    @property(SpriteFrame)
    frame: SpriteFrame = null!;
}

// Sprites of a car; on the car itself (prefab) or on the parent node to share between cars
@ccclass('CarSkin')
export class CarSkin extends Component {
    @property(SpriteFrame)
    emptyFrame: SpriteFrame = null!;
    @property(SpriteFrame)
    closedFrame: SpriteFrame = null!;
    @property([CargoUnitFrame])
    units: CargoUnitFrame[] = [];

    getUnit(color: ColorType): SpriteFrame {
        let unit = this.units.find(u => u.color == color);
        return unit ? unit.frame : null;
    }
}
