export const PRESET_COLORS = [
    '#FF5A5F', // Airbnb Red
    '#00A699', // Airbnb Teal
    '#FC642D', // Airbnb Orange
    '#7B519D', // Airbnb Purple
    '#2B2B2B', // Dark Grey
    '#1B1B1B', // Darker Grey
    '#D23556', // Rose
    '#484848', // Medium Grey
];

export function getContrastColor(hexColor: string): string {
    // Falls kein Hex (z.B. rgba), default zu weiß
    if (!/^#[0-9A-F]{6}$/i.test(hexColor)) return '#FFFFFF';

    // Parse hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // YIQ formula um Helligkeit  zu berechnen
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    // Helle Farben -> schwarzer Text, Dunkle Farben -> weißer Text
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
}
