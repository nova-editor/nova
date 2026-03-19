declare module "react-file-icon" {
  import { FC } from "react";

  export interface FileIconProps {
    extension?:      string;
    size?:           number;
    color?:          string;
    labelColor?:     string;
    labelTextColor?: string;
    type?:           string;
    glyphColor?:     string;
    fold?:           boolean;
    foldColor?:      string;
    radius?:         number;
    gradientColor?:  string;
    gradientOpacity?:number;
  }

  export const FileIcon: FC<FileIconProps>;
  export const defaultStyles: Record<string, Partial<FileIconProps>>;
}
