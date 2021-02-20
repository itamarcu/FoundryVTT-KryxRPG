import {KRYX_RPG} from "../config.js";

/**
 * A helper class for building MeasuredTemplates for Kryx RPG spells and abilities
 * @extends {MeasuredTemplate}
 */
export default class AbilityTemplate extends MeasuredTemplate {

  /**
   * A factory method to create an AbilityTemplate instance using provided data from an ItemKryx instance
   * @param {ItemKryx} item             The Item object for which to construct the template
   * @param {number} scaling            Multiplier for the value (used for spells with scaling AoE)
   * @param {string} targetType         target type override (e.g. when user selects cone or line)
   * @return {AbilityTemplate|null}     The template object, or null if the item does not produce a template
   */
  static fromItem(item, scaling, targetType) {
    const templateShape = KRYX_RPG.areaTargetTypes[targetType];
    let distance = CONFIG.KRYX_RPG.areaScalingStandardSizes[targetType]
    if (templateShape === undefined || distance === undefined) {
      ui.notifications.error(`Failed placing template for ${item.name}; ${targetType}`)
      return null
    }
    distance *= scaling

    // Prepare template data
    const templateData = {
      t: templateShape,
      user: game.user._id,
      distance: distance,
      direction: 0,
      x: 0,
      y: 0,
      fillColor: game.user.color
    }

    // Additional type-specific data
    switch (templateShape) {
      case "cone":
        templateData.angle = CONFIG.MeasuredTemplate.defaults.angle;
        break;
      case "ray": // Kryx RPG rays are most commonly 5ft wide
        templateData.width = 5;
        break;
      default:
        break;
    }

    // Return the template constructed from the item data
    const template = new this(templateData);
    template.item = item;
    template.actorSheet = item.actor?.sheet || null;
    return template;
  }

  /* -------------------------------------------- */

  /**
   * Creates a preview of the spell template
   */
  drawPreview() {
    const initialLayer = canvas.activeLayer;

    // Draw the template and switch to the template layer
    this.draw();
    this.layer.activate();
    this.layer.preview.addChild(this);

    // Hide the sheet that originated the preview
    if (this.actorSheet) this.actorSheet.minimize();

    // Activate interactivity
    this.activatePreviewListeners(initialLayer);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners for the template preview
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   */
  activatePreviewListeners(initialLayer) {
    const handlers = {};
    let moveTime = 0;

    // Update placement (mouse-move)
    handlers.mm = event => {
      event.stopPropagation();
      let now = Date.now(); // Apply a 20ms throttle
      if (now - moveTime <= 20) return;
      const center = event.data.getLocalPosition(this.layer);
      const snapped = canvas.grid.getSnappedPosition(center.x, center.y, 2);
      this.data.x = snapped.x;
      this.data.y = snapped.y;
      this.refresh();
      moveTime = now;
    };

    // Cancel the workflow (right-click)
    handlers.rc = event => {
      this.layer.preview.removeChildren();
      canvas.stage.off("mousemove", handlers.mm);
      canvas.stage.off("mousedown", handlers.lc);
      canvas.app.view.oncontextmenu = null;
      canvas.app.view.onwheel = null;
      initialLayer.activate();
      this.actorSheet.maximize();
    };

    // Confirm the workflow (left-click)
    handlers.lc = event => {
      handlers.rc(event);

      // Confirm final snapped position
      const destination = canvas.grid.getSnappedPosition(this.x, this.y, 2);
      this.data.x = destination.x;
      this.data.y = destination.y;

      // Create the template
      canvas.scene.createEmbeddedEntity("MeasuredTemplate", this.data);
    };

    // Rotate the template by 3 degree increments (mouse-wheel)
    handlers.mw = event => {
      if (event.ctrlKey) event.preventDefault(); // Avoid zooming the browser window
      event.stopPropagation();
      let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
      let snap = event.shiftKey ? delta : 5;
      this.data.direction += (snap * Math.sign(event.deltaY));
      this.refresh();
    };

    // Activate listeners
    canvas.stage.on("mousemove", handlers.mm);
    canvas.stage.on("mousedown", handlers.lc);
    canvas.app.view.oncontextmenu = handlers.rc;
    canvas.app.view.onwheel = handlers.mw;
  }
}
