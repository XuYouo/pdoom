export interface ChartPoint {
	/** ISO day, `yyyy-mm-dd`: where the marker sits on the time axis. */
	date: string;
	y: number;
	/** Second line under the value in the tooltip. */
	note?: string;
}

export interface ChartSeries {
	id: string;
	label: string;
	/**
	 * Palette slot. Give a thing the same slot on every chart so it keeps its colour and marker
	 * across pages.
	 */
	color: number;
	points: ChartPoint[];
}
