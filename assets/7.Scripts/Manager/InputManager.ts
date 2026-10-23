import { _decorator, Component, EventTouch, Input, input, misc, Node, v2, Vec2 } from 'cc';
import { CarController } from '../Gameplay/Car/CarController';
import { ui } from './UI';
const { ccclass, property } = _decorator;

@ccclass('InputManager')
export class InputManager extends Component {

    static instance: InputManager = null;

    // car the tutorial hand points at until the first tap
    @property(CarController)
    tutorialCar: CarController = null;

    onLoad() {
        InputManager.instance = this;
    }

    startPos: Vec2 = null;

    dir: Vec2 = null;

    enabledInput: boolean = true;
    tutorial: boolean = false;

    bindingStart() {}
    bindingMove() {}
    bindingEnd() {}
    bindingUpdate() {}

    onTouchStart(event: EventTouch) {
        this.startPos = event.getUILocation();
        this.bindingStart();
        if (this.enabledInput) this.tapCar(event.getLocation());
    }

    onTouchMove(event: EventTouch) {
        // console.log('move');

        let touch = event.touch;
        let pos = touch.getUILocation();
        this.dir = pos.clone().subtract(this.startPos);
        let len = misc.clampf(this.dir.length(), 0, 5);
        // let r = 80;
        // this.dir = this.dir.normalize().multiplyScalar(len);
        this.bindingMove();
        this.startPos = pos;
        this.dir = null;
    }

    onTouchEnd(event: EventTouch) {
        this.bindingEnd();
        this.startPos = null;
        this.dir = null;
    }

    // screen position -> car under the finger (last sibling is drawn on top, so check it first)
    findCar(screenPos: Vec2): CarController {
        let cars = CarController.all.slice().sort((a, b) => b.node.getSiblingIndex() - a.node.getSiblingIndex());
        return cars.find(car => car.hitTest(screenPos)) || null;
    }

    tapCar(screenPos: Vec2) {
        let car = this.findCar(screenPos);
        if (!car) return;
        if (this.tutorial) {
            this.tutorial = false;
            ui?.offHand();
        }
        car.onTap();
    }

    showTutorial() {
        if (!this.tutorialCar || !ui || !ui.hand) return;
        this.tutorial = true;
        ui.handTap(this.tutorialCar.node);
    }

    binding() {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    unBinding() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    start() {
        this.binding()
        this.showTutorial();
    }

    onDestroy() {
        this.unBinding();
    }

    update(deltaTime: number) {
       this.bindingUpdate();
    }
}
