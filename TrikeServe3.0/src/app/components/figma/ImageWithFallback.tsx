import React, { useState } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeT0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4K'

export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  // Remember *which* src failed rather than a bare boolean.
  //
  // A latched boolean meant that once an image 404'd it kept rendering the
  // placeholder forever, even after the business uploaded a new picture and the
  // src prop changed to the fresh URL -- so edited menu photos never appeared.
  // Comparing the failed src against the current one lets a new src retry.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const { src, alt, style, className, ...rest } = props
  const didError = failedSrc !== null && failedSrc === src

  const handleError = () => {
    setFailedSrc(typeof src === 'string' ? src : String(src))
  }

  return didError ? (
    <div
      className={`inline-block bg-[var(--muted)] text-center align-middle ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-center justify-center w-full h-full">
        <img src={ERROR_IMG_SRC} alt="Error loading image" {...rest} data-original-url={src} />
      </div>
    </div>
  ) : (
    <img src={src} alt={alt} className={className} style={style} {...rest} onError={handleError} />
  )
}
