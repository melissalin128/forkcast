/**
 * Figma Make preview entrypoint.
 *
 * The product web client lives in apps/web so the browser and Expo apps can
 * evolve together. Re-export it here instead of maintaining a disconnected
 * marketing prototype with different sample data.
 */
export { default } from '../apps/web/src/App';
