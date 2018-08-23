import * as React from 'react';

interface Props {
  readonly className?: string;
  readonly width: number;
  readonly height: number;
}

export function Monogram({ className, width, height }: Props) {
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 164.062 164.062">
      <g>
        <path
          fill="#00FF9C"
          d="M82.03,0.486c-45.036,0-81.544,36.51-81.544,81.546c0,45.035,36.508,81.543,81.544,81.543
        c45.035,0,81.545-36.508,81.545-81.543C163.575,36.996,127.065,0.486,82.03,0.486z M82.03,148.751
        c-36.85,0-66.719-29.872-66.719-66.719c0-36.85,29.869-66.72,66.719-66.72c36.848,0,66.72,29.87,66.72,66.72
        C148.75,118.879,118.878,148.751,82.03,148.751z"
        />
        <g>
          <path
            fill="#00FF9C"
            d="M104.271,52.381c0,4.092,3.317,7.414,7.414,7.414c4.095,0,7.414-3.322,7.414-7.414
          c0-4.097-3.319-7.413-7.414-7.413C107.588,44.968,104.271,48.284,104.271,52.381z"
          />
          <path
            fill="#00FF9C"
            d="M52.376,119.037c4.094,0,7.415-3.316,7.415-7.414c0-4.094-3.321-7.413-7.415-7.413
          s-7.414,3.319-7.414,7.413C44.962,115.721,48.282,119.037,52.376,119.037z"
          />
          <polygon
            fill="#00FF9C"
            points="104.271,74.597 104.274,93.776 55.462,44.968 44.962,44.968 44.962,89.438 59.789,89.438
          59.784,70.257 108.608,119.037 119.099,119.037 119.099,74.597 		"
          />
        </g>
      </g>
    </svg>
  );
}
