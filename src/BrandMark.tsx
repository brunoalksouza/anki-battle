export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className="brand-mark"
    />
  );
}
