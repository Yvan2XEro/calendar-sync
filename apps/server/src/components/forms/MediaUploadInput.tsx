"use client";

import {
        type ChangeEvent,
        type DragEvent,
        useCallback,
        useRef,
        useState,
} from "react";
import { upload } from "@vercel/blob/client";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type MediaUploadInputProps = {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
        disabled?: boolean;
        accept?: string;
        allowUpload?: boolean;
        allowUrl?: boolean;
        description?: string;
        linkLabel?: string;
        uploadLabel?: string;
        clearLabel?: string;
        className?: string;
        inputId?: string;
};

export function MediaUploadInput({
        value,
        onChange,
        placeholder = "https://example.com/asset.jpg",
        disabled = false,
        accept = "image/*",
        allowUpload = true,
        allowUrl = true,
        description,
        linkLabel = "Or paste a link",
        uploadLabel = "Upload image",
        clearLabel = "Clear",
        className,
        inputId,
}: MediaUploadInputProps) {
        const inputRef = useRef<HTMLInputElement | null>(null);
        const [isUploading, setIsUploading] = useState(false);
        const [isDragOver, setIsDragOver] = useState(false);

        const resetFileInput = () => {
                if (inputRef.current) {
                        inputRef.current.value = "";
                }
        };

        const handleFiles = useCallback(
                async (files: FileList | null) => {
                        if (!allowUpload || !files || files.length === 0) return;

                        const [file] = Array.from(files);
                        if (!file) return;

                        if (!file.type.startsWith("image/")) {
                                toast.error("Only image files are supported.");
                                resetFileInput();
                                return;
                        }

                        setIsUploading(true);
                        try {
                                const blob = await upload(file.name, file, {
                                        access: "public",
                                        handleUploadUrl: "/api/upload",
                                });
                                onChange(blob.url);
                                toast.success("Image uploaded");
                        } catch (error) {
                                console.error(error);
                                toast.error("Failed to upload image.");
                        } finally {
                                setIsUploading(false);
                                resetFileInput();
                        }
                },
                [allowUpload, onChange],
        );

        const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
                        void handleFiles(event.target.files);
        };

        const onDrop = (event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                if (disabled || isUploading) return;
                setIsDragOver(false);
                void handleFiles(event.dataTransfer?.files ?? null);
        };

        const onDragOver = (event: DragEvent<HTMLDivElement>) => {
                if (disabled || isUploading) return;
                event.preventDefault();
                setIsDragOver(true);
        };

        const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setIsDragOver(false);
        };

        return (
                <div className={cn("space-y-3", className)}>
                        {allowUpload ? (
                                <div
                                        className={cn(
                                                "group relative rounded-lg border border-dashed bg-muted/30 p-4 text-center transition",
                                                disabled
                                                        ? "cursor-not-allowed opacity-50"
                                                        : "cursor-pointer hover:border-primary/70",
                                                isDragOver ? "border-primary bg-primary/10" : "",
                                        )}
                                        onClick={() => {
                                                if (disabled || isUploading) return;
                                                inputRef.current?.click();
                                        }}
                                        onDragOver={onDragOver}
                                        onDragLeave={onDragLeave}
                                        onDrop={onDrop}
                                >
                                        <input
                                                ref={inputRef}
                                                type="file"
                                                accept={accept}
                                                className="hidden"
                                                onChange={onFileInputChange}
                                                disabled={disabled || isUploading}
                                        />
                                        <div className="flex flex-col items-center gap-3">
                                                <div className="flex size-12 items-center justify-center rounded-full border bg-background">
                                                        {isUploading ? (
                                                                <Loader2 className="size-6 animate-spin text-primary" />
                                                        ) : (
                                                                <UploadCloud className="size-6 text-muted-foreground transition group-hover:text-primary" />
                                                        )}
                                                </div>
                                                <div className="space-y-1">
                                                        <p className="font-medium text-sm">{uploadLabel}</p>
                                                        <p className="text-muted-foreground text-xs">
                                                                {description ?? "Drag and drop or choose an image to upload."}
                                                        </p>
                                                </div>
                                                <div className="flex flex-wrap items-center justify-center gap-2">
                                                        <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={disabled || isUploading}
                                                        >
                                                                {isUploading ? (
                                                                        <span className="flex items-center gap-2">
                                                                                <Loader2 className="size-4 animate-spin" />
                                                                                Uploading…
                                                                        </span>
                                                                ) : (
                                                                        "Choose file"
                                                                )}
                                                        </Button>
                                                        {value ? (
                                                                <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                if (disabled || isUploading) return;
                                                                                onChange("");
                                                                        }}
                                                                        disabled={disabled || isUploading}
                                                                >
                                                                        {clearLabel}
                                                                </Button>
                                                        ) : null}
                                                </div>
                                        </div>
                                </div>
                        ) : null}
                        {allowUrl ? (
                                <div className="space-y-1 text-left">
                                        <p className="text-muted-foreground text-xs font-medium">{linkLabel}</p>
                                        <Input
                                                id={inputId}
                                                value={value}
                                                onChange={(event) => onChange(event.target.value)}
                                                placeholder={placeholder}
                                                disabled={disabled || isUploading}
                                        />
                                </div>
                        ) : null}
                </div>
        );
}
