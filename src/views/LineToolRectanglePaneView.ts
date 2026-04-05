// /src/views/LineToolRectanglePaneView.ts

/**
 * The PaneView for the Rectangle line tool.
 * It prepares the data for the generic RectangleRenderer, TextRenderer, and LineAnchorRenderer
 * based on the LineToolRectangle's state and options. It then combines these using
 * the CompositeRenderer from the core plugin to render the final tool on the chart.
 */

// Import necessary types and classes from Lightweight Charts
import { Coordinate, IChartApiBase, ISeriesApi, SeriesType, Logical } from 'lightweight-charts';

// Import core plugin types and classes
import {
	// BaseLineTool is now abstract, specific tool instance will be passed to constructor
	BaseLineTool,
	// IPaneRenderer is now the interface for all our renderers
	IPaneRenderer,
	// Renderers for drawing shapes and text
	RectangleRenderer,
	RectangleRendererData,
	TextRenderer,
	CompositeRenderer,
	// Types for options and data structure
	LineToolOptionsInternal,
	// Geometric types
	Point,
	AnchorPoint,
	deepCopy,
	BoxHorizontalAlignment,
	BoxVerticalAlignment,
	LineToolPaneView,
	PaneCursorType,
	TextRendererData,
	LineToolPoint,

} from 'lightweight-charts-line-tools-core';

// Import the specific tool model for strong typing (LineToolRectangle)
import { LineToolRectangle } from '../model/LineToolRectangle';



/**
 * The specific Pane View for the Rectangle tool.
 * 
 * **Tutorial Note:**
 * In the Lightweight Charts Line Tools architecture (MVC), this class acts as the **View**.
 * 
 * **Responsibilities:**
 * 1. **Bridge:** It sits between the **Model** (`LineToolRectangle`) and the **Rendering Engine** (`CompositeRenderer`).
 * 2. **Translation:** It converts the Model's abstract logical points (Time/Price) into concrete screen coordinates (Pixels).
 * 3. **Composition:** It decides *what* to draw. For a rectangle, it instantiates and configures:
 *    - A `RectangleRenderer` (for the background and borders).
 *    - A `TextRenderer` (for the label).
 *    - A `LineAnchorRenderer` (via the base class) for the 8 resize handles.
 * 4. **Optimization:** It implements specific **Culling Logic** to prevent rendering when the tool is off-screen.
 */
export class LineToolRectanglePaneView<HorzScaleItem> extends LineToolPaneView<HorzScaleItem> {
	// Rectangle and Text renderers are now declared and initialized in the BaseLineToolPaneView
	// protected _rectangleRenderer: RectangleRenderer; // No longer need to declare here if initialized in base
	// protected _labelRenderer: TextRenderer; // No longer need to declare here if initialized in base

	/**
     * Initializes the View instance.
     * 
     * **Tutorial Note:**
     * The constructor receives the specific `LineToolRectangle` instance. 
     * By passing this specific type (instead of the generic `BaseLineTool`), we gain type safety 
     * when accessing rectangle-specific options (like `options.rectangle.extend`) later in the render loop.
     * 
     * We pass these references up to the `super()` constructor, which initializes the shared 
     * `CompositeRenderer`, `RectangleRenderer`, and `TextRenderer` instances automatically.
     * 
     * @param source - The concrete Model instance for this rectangle.
     * @param chart - The LWC Chart API (used for coordinate conversion).
     * @param series - The LWC Series API (used for price conversion).
     */
	public constructor(
		source: LineToolRectangle<HorzScaleItem>, // Specific tool instance
		chart: IChartApiBase<any>, // Chart API
		series: ISeriesApi<SeriesType, any>, // Series API
	) {
		// Call the super constructor (LineToolPaneView) to initialize common properties and renderers.
		super(source, chart, series);

		// The renderers (_rectangleRenderer, _labelRenderer, _renderer) are now initialized
		// in the LineToolPaneView base class constructor.
		// We can directly use them here.
	}

	/**
     * The main rendering loop for this tool.
     * 
     * **Tutorial Note:**
     * This method is called by the Core whenever the chart needs to paint (e.g., on scroll, zoom, or mouse move),
     * *but only if* `update()` has been called to mark the view as "invalidated".
     * 
     * **The Render Lifecycle:**
     * 1. **Clear:** We wipe the `_renderer` clean. It's a fresh frame.
     * 2. **Check Visibility:** If the tool is hidden via options, we abort.
     * 3. **Update Points:** We call `_updatePoints()` (from Base) to convert Time/Price -> x/y pixels.
     * 4. **Culling:** We determine if the tool is actually visible in the viewport.
     * 5. **Populate:** If visible, we configure the `RectangleRenderer` and `TextRenderer` with the new 
     *    coordinates and styles, then `append()` them to the `CompositeRenderer`.
     * 6. **Anchors:** We calculate and add the interaction handles.
     * 
     * @override
     */
	protected override _updateImpl(height: number, width: number): void {
		this._invalidated = false;
		this._renderer.clear();
		//console.log(`[RectanglePaneView] Update triggered. Pane dimensions: ${width}x${height}`);

		const options = this._tool.options() as LineToolOptionsInternal<'Rectangle'>;
		if (!options.visible) {
			console.log('[RectanglePaneView] Update stopped: Tool is not visible.');
			return;
		}

		/**
		 * CULLING CHECK
		 * 
		 * We query the Model's pre-calculated state. This check now correctly 
		 * accounts for 2D area visibility and infinite extensions, ensuring 
		 * the background fill remains visible when the user is zoomed in.
		 */
		if (this._tool.isCulled()) {
			//TODO this tool needs cull testing
			//console.log('rectangle culled')
			return;
		}

		const hasUpdatedPoints = this._updatePoints();
		//console.log(`[RectanglePaneView] _updatePoints() returned: ${hasUpdatedPoints}`);

		if (!hasUpdatedPoints) {
			console.log('[RectanglePaneView] Update stopped: Point conversion failed.');
			return;
		}

		
		//console.log(`[RectanglePaneView] Points available for drawing: ${this._points.length}`);
		if (this._points.length > 0) {
			//console.log('[RectanglePaneView] Point details:', JSON.parse(JSON.stringify(this._points)));
		}

		// During creation (ghost mode), we will have 2 points (1 real, 1 ghost).
		// When finished, we will have 2 real points.
		if (this._points.length !== this._tool.pointsCount) {
			//console.log(`[RectanglePaneView] Update stopped: Not enough points to draw rectangle. Have ${this._points.length}, need ${this._tool.pointsCount}.`);
			return;
		}

		const rectanglePoints: [AnchorPoint, AnchorPoint] = [this._points[0], this._points[1]];

		// --- 1. Prepare and add the Rectangle Renderer ---
		//console.log('[RectanglePaneView] Preparing and appending RectangleRenderer...');

		// --- Data Construction ---

		/**
		 * **Tutorial Note - Preparing Renderer Data:**
		 * We are about to feed the `` `RectangleRenderer` ``. This data object acts as the instructions.
		 * 
		 * 1. **...deepCopy(options.rectangle):** We take the user's styling (colors, borders, line width) 
		 *    directly from the options. `deepCopy` is meant to ensure we don't accidentally mutate the source options 
		 *    during rendering (though strictly speaking, renderers should be read-only).
		 * 2. **points:** We pass the screen coordinates we converted earlier.
		 * 3. **Cursors:** We pass the cursors defined in the tool options so the renderer knows what to show 
		 *    when the user hovers the border (Pointer) or drags the body (Grabbing).
		 */
		const rectangleRendererData: RectangleRendererData = {
			...deepCopy(options.rectangle),
			points: rectanglePoints,
			hitTestBackground: false,
			toolDefaultHoverCursor: options.defaultHoverCursor,
			toolDefaultDragCursor: options.defaultDragCursor,
		};

		this._rectangleRenderer.setData(rectangleRendererData);

		(this._renderer as CompositeRenderer<any>).append(this._rectangleRenderer);
		//console.log('[RectanglePaneView] RectangleRenderer appended.');

		// --- 2. Prepare and add the Text Renderer (if applicable) ---
		if (options.text.value) {
			//console.log('[RectanglePaneView] Preparing and appending TextRenderer...');

			/**
			 * **Tutorial Note - The Text Layer:**
			 * The Rectangle tool supports an optional text label centered or aligned within it.
			 * 
			 * We reuse the *same* `rectanglePoints` used for the shape. The `` `TextRenderer` `` is smart enough 
			 * to calculate the center/alignment relative to this bounding box.
			 * 
			 * **Hit Testing:**
			 * Note that `hitTestBackground` is set to `true` here. This means if the user clicks on the text 
			 * (or its background box), it counts as clicking the tool itself, allowing for selection or dragging.
			 */
			const textRendererData: TextRendererData = {
				text: deepCopy(options.text),
				points: rectanglePoints,
				toolDefaultHoverCursor: options.defaultHoverCursor,
				toolDefaultDragCursor: options.defaultDragCursor,
				hitTestBackground: true,
			};

			this._labelRenderer.setData(textRendererData);
			(this._renderer as CompositeRenderer<any>).append(this._labelRenderer);

			//console.log('[RectanglePaneView] TextRenderer appended.');
		}

		// --- 3. Prepare and add the Anchor Points for resizing ---
		//if (this.areAnchorsVisible()) {
			//console.log('[RectanglePaneView] Preparing and appending anchors...');
			//this._addAnchors(this._renderer as CompositeRenderer<any>);
			//console.log('[RectanglePaneView] Anchors appended.');
		//}
		
		this._addAnchors(this._renderer as CompositeRenderer<any>);
	}

	/**
	 * Calculates and renders the interactive resize handles (anchors) for the rectangle.
	 * 
	 * **Tutorial Note - Custom Anchor Logic:**
	 * We override this method because a Rectangle has complex anchor requirements that the default logic doesn't handle:
	 * 1. **8 Handles:** Corners (resize both dimensions) + Midpoints (resize width OR height).
	 * 2. **Dynamic Cursors:** The cursor for the top-left corner depends on the rectangle's orientation. 
	 *    If the user dragged "up and left" vs "down and right", the diagonal resize direction flips (NWSE vs NESW).
	 * 
	 * This method calculates the geometry for all 8 points, determines the correct cursor for the corners 
	 * based on sign of width/height, and registers them.
	 * 
	 * @override
	 */
	protected override _addAnchors(renderer: CompositeRenderer<any>): void {
		if (this._points.length < 2) return;

		const [point0, point1] = this._points;
		const minX = Math.min(point0.x, point1.x);
		const maxX = Math.max(point0.x, point1.x);
		const minY = Math.min(point0.y, point1.y);
		const maxY = Math.max(point0.y, point1.y);

		const xDiff = point0.x - point1.x;
		const yDiff = point0.y - point1.y;
		const sign = Math.sign(xDiff * yDiff); // Determines primary diagonal direction

		// Cursors based on the diagonal direction for corners
		const diag1Cursor = sign < 0 ? PaneCursorType.DiagonalNeSwResize : PaneCursorType.DiagonalNwSeResize; // NE-SW or NW-SE
		const diag2Cursor = sign < 0 ? PaneCursorType.DiagonalNwSeResize : PaneCursorType.DiagonalNeSwResize; // NW-SE or NE-SW

		// --- DEFINE EACH ANCHOR POINT WITH ITS CANONICAL INDEX ---

		// 0: Top-Left (TL)
		const topLeft = new AnchorPoint(minX, minY, 0, false, diag1Cursor); 
		
		// 6: Top-Center (TC)
		const topCenter = new AnchorPoint((minX + maxX) / 2 as Coordinate, minY, 6, true, PaneCursorType.VerticalResize); 

		// 3: Top-Right (TR)
		const topRight = new AnchorPoint(maxX, minY, 3, false, diag2Cursor); 
		
		// 5: Middle-Right (MR)
		const middleRight = new AnchorPoint(maxX, (minY + maxY) / 2 as Coordinate, 5, true, PaneCursorType.HorizontalResize);

		// 1: Bottom-Right (BR)
		const bottomRight = new AnchorPoint(maxX, maxY, 1, false, diag1Cursor); 
		
		// 7: Bottom-Center (BC)
		const bottomCenter = new AnchorPoint((minX + maxX) / 2 as Coordinate, maxY, 7, true, PaneCursorType.VerticalResize);

		// 2: Bottom-Left (BL)
		const bottomLeft = new AnchorPoint(minX, maxY, 2, false, diag2Cursor);

		// 4: Middle-Left (ML)
		const middleLeft = new AnchorPoint(minX, (minY + maxY) / 2 as Coordinate, 4, true, PaneCursorType.HorizontalResize);


		const anchorData = {
			// ** NEW: Array is ordered according to the canonical sequence: 0, 6, 3, 5, 1, 7, 2, 4 **
			points: [
				topLeft, topCenter, topRight, middleRight, 
				bottomRight, bottomCenter, bottomLeft, middleLeft
			],
		};
 
		// Pass tool-level default anchor cursors to createLineAnchor
		const toolOptions = this._tool.options();

		/**
		 * **Tutorial Note - Anchor Creation & Composition:**
		 * 
		 * 1. **`this.createLineAnchor(...)`:** This is a helper method provided by the `` `LineToolPaneView` `` base class.
		 *    It is highly optimized: it recycles existing renderer instances (object pooling) to avoid 
		 *    creating new JavaScript objects every frame, which would cause Garbage Collection stutters.
		 * 
		 * 2. **One Renderer, Many Points:** We pass the entire array of 8 `` `AnchorPoint` `` objects to a *single* 
		 *    `` `LineAnchorRenderer` ``. This is much more efficient than creating 8 separate renderers.
		 * 
		 * 3. **`renderer.append(...)`:** Finally, we add this anchor renderer to the `` `CompositeRenderer` ``. 
		 *    Since this is added *after* the rectangle and text (in `_updateImpl`), the anchors will draw 
		 *    **on top** of the shape, which is critical for visibility.
		 */
		renderer.append(this.createLineAnchor({
			...anchorData,
			defaultAnchorHoverCursor: toolOptions.defaultAnchorHoverCursor,
			defaultAnchorDragCursor: toolOptions.defaultAnchorDragCursor,
		}, 0));
	}
}